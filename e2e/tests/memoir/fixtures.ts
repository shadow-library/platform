/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, test as base, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  type AdminApi,
  clearIpState,
  clientIpHeaders,
  createAdminApi,
  createIdentitySession,
  createIdentityUser,
  createOAuthApplication,
  deleteIdentityUser,
  deleteOAuthApplication,
  freshClientIp,
  identityApi,
  type IdentitySession,
  identitySessionContext,
  identityStorageState,
  type IdentityUser,
  memoirDb,
  type OAuthApplication,
  redisDel,
  redisScan,
  requireProductUrl,
  runAll,
} from '../../lib';
import { type AccountView, ensureOnboarded } from './helpers';

/**
 * Defining types
 */

export interface MemoirPersonaOptions {
  /** Readable tag embedded in the generated identity email, e.g. `jit-race`. */
  label?: string;
  /** Completes onboarding (USD, UTC, 06:00–23:00) before returning. Default false: the account is not even provisioned yet. */
  onboard?: boolean;
  /** Sent as `X-Forwarded-For` on every call, so identity charges this address for the OIDC hop. */
  clientIp?: string;
}

/** What removing a persona needs, which a half-built one also satisfies. */
interface MemoirPersonaRemnants {
  readonly user: IdentityUser;
  readonly ctx?: APIRequestContext;
}

export interface MemoirPersona extends MemoirPersonaRemnants {
  /** The identity `sub`, which is also `accounts.identity_sub`. */
  readonly sub: string;
  readonly session: IdentitySession;
  /** A memoir context carrying this user's `__Host-shadow-session`, plus identity's cookies for a re-hop. */
  readonly ctx: APIRequestContext;
  /** Present when `onboard` was asked for. */
  readonly account?: AccountView;
}

/** A bare `accounts` row with a synthetic `identity_sub` no identity user owns, for arranging state straight in the database. */
export interface DisposableAccount {
  /** `accounts.id`, as the decimal string Postgres returns for int8. */
  readonly id: string;
  readonly identitySub: string;
}

export interface MemoirHarness {
  /** This test's own client address; every identity-facing call below is charged to it. */
  readonly clientIp: string;
  /** A brand-new identity user signed into memoir, removed with every memoir row it owns after the test. */
  persona(options?: Omit<MemoirPersonaOptions, 'clientIp'>): Promise<MemoirPersona>;
  /** A raw `accounts` row, removed with everything that cascades from it after the test. */
  disposableAccount(label?: string): Promise<DisposableAccount>;
  /** A cookie-less memoir context — an unauthenticated caller, or one presenting only a bearer token. */
  guest(): Promise<APIRequestContext>;
  /** An identity context signed in as `persona`, for the OAuth calls that ride a session. */
  identityCaller(persona: MemoirPersona): Promise<APIRequestContext>;
  /** A cookie-less identity context — the token endpoint refuses a cookie-carrying caller with `S010` (CSRF). */
  identityAnonymous(): Promise<APIRequestContext>;
  /** The bootstrap admin at AAL2, for the OAuth applications a foreign-audience token is minted from. */
  identityAdmin(): Promise<AdminApi>;
  /** A throwaway PUBLIC application with its own `api://` audience and a redirecting first-party client. */
  createOAuthApp(label?: string): Promise<OAuthApplication>;
}

/**
 * Declaring the constants
 *
 * The memoir harness. Every persona is a fresh identity user built in the database (no registration budget spent) and
 * signed into memoir through the real OIDC hop, so a test can mutate its account freely while other lanes drive the
 * seeded personas. Everything a test arranges is removed afterwards even when an earlier teardown step throws.
 *
 * Memoir caches `sub → account id` in-process for `account.context-ttl` (60 s) and answers a cached id whose row is
 * gone with ACC_002. Removing a persona's account is still safe because identity never reissues a `sub`.
 */

export class MemoirPersonaError extends Error {
  override readonly name = 'MemoirPersonaError';
}

const SESSION_COOKIE = '__Host-shadow-session';

/**
 * Removes every memoir account `identitySub` owns. Its domain rows cascade with it; `billing_events` only nulls its
 * reference, so those rows go first.
 */
export async function deleteMemoirAccounts(identitySub: string): Promise<void> {
  const sql = memoirDb();
  await sql`DELETE FROM billing_events WHERE account_id IN (SELECT id FROM accounts WHERE identity_sub = ${identitySub})`;
  await sql`DELETE FROM accounts WHERE identity_sub = ${identitySub}`;
}

/** Identity's per-client token-endpoint counters (`rl:<bucket>:<clientId>` and `rl:<bucket>:<clientId>:<ip>`), which outlive the client. */
export async function clearClientRateLimits(clientId: string): Promise<void> {
  const keys = [...(await redisScan(`rl:*:${clientId}`)), ...(await redisScan(`rl:*:${clientId}:*`))];
  if (keys.length > 0) await redisDel(...keys);
}

async function removeMemoirPersona(persona: MemoirPersonaRemnants): Promise<void> {
  await runAll([async () => persona.ctx?.dispose(), () => deleteMemoirAccounts(persona.user.sub), () => deleteIdentityUser(persona.user)]);
}

export function deleteMemoirPersona(persona: MemoirPersona): Promise<void> {
  return removeMemoirPersona(persona);
}

/** Follows one hop of the login chain without following the redirect it answers with. */
async function hop(ctx: APIRequestContext, url: string): Promise<string> {
  const response = await ctx.get(url, { maxRedirects: 0 });
  const location = response.headers().location;
  if (response.status() !== 302 || !location) throw new MemoirPersonaError(`expected a redirect from ${url}, got ${response.status()} ${await response.text()}`);
  return new URL(location, response.url()).href;
}

/**
 * Walks login → identity authorize → memoir callback one redirect at a time and stops there. Following the callback's own
 * redirect would load memoir-web, whose server render may read the account and provision it before the caller asked.
 */
async function signInToMemoir(ctx: APIRequestContext, user: IdentityUser): Promise<void> {
  const authorize = await hop(ctx, '/api/auth/login?return_to=/');
  const callback = await hop(ctx, authorize);
  if (!callback.startsWith(`${requireProductUrl('memoir')}/api/auth/callback`)) throw new MemoirPersonaError(`identity did not hand ${user.email} back to memoir: ${callback}`);
  await hop(ctx, callback);

  const { cookies } = await ctx.storageState();
  if (!cookies.some(cookie => cookie.name === SESSION_COOKIE)) throw new MemoirPersonaError(`memoir's callback set no ${SESSION_COOKIE} for ${user.email}`);
  const probe = await ctx.get('/api/auth/session');
  if (!probe.ok()) throw new MemoirPersonaError(`no memoir session for ${user.email} after the OIDC hop: ${probe.status()} ${await probe.text()}`);
  const { sub } = (await probe.json()) as { sub: string };
  if (sub !== user.sub) throw new MemoirPersonaError(`memoir resolved the session to sub ${sub}, expected ${user.sub}`);
}

/**
 * A fresh identity user with a live memoir session. Memoir provisions the account on the first account-scoped request, so
 * unless `onboard` is set none exists yet when this returns. A failure anywhere after the user exists takes it back down.
 */
export async function createMemoirPersona(options: MemoirPersonaOptions = {}): Promise<MemoirPersona> {
  const memoirUrl = requireProductUrl('memoir');
  const user = await createIdentityUser({ label: `memoir-${options.label ?? 'persona'}` });
  let remnants: MemoirPersonaRemnants = { user };

  try {
    const session = await createIdentitySession(user.userId);
    const ctx = await request.newContext({
      baseURL: memoirUrl,
      ignoreHTTPSErrors: true,
      storageState: identityStorageState(session),
      extraHTTPHeaders: options.clientIp ? clientIpHeaders(options.clientIp) : undefined,
    });
    remnants = { ...remnants, ctx };

    await signInToMemoir(ctx, user);
    const account = options.onboard ? await ensureOnboarded(ctx) : undefined;
    return { user, sub: user.sub, session, ctx, ...(account ? { account } : {}) };
  } catch (error) {
    await removeMemoirPersona(remnants).catch(() => undefined);
    throw error;
  }
}

/** Inserts an `accounts` row with the same placeholders memoir's first-contact provisioning writes. */
export async function createDisposableAccount(label = 'account'): Promise<DisposableAccount> {
  const identitySub = `e2e-${label}-${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  const [row] = await memoirDb()<{ id: string }[]>`
    INSERT INTO accounts (identity_sub, auth_provider, default_currency, enabled_currencies, timezone)
    VALUES (${identitySub}, 'google', 'USD', ARRAY['USD']::char(3)[], 'UTC')
    RETURNING id::text
  `;
  if (!row) throw new MemoirPersonaError(`account insert for ${identitySub} returned no row`);
  return { id: row.id, identitySub };
}

export function deleteDisposableAccount(account: Pick<DisposableAccount, 'identitySub'>): Promise<void> {
  return deleteMemoirAccounts(account.identitySub);
}

export const test = base.extend<{ memoir: MemoirHarness }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  memoir: async ({}, use) => {
    const memoirUrl = requireProductUrl('memoir');
    const clientIp = await freshClientIp();
    const contexts: APIRequestContext[] = [];
    const personas: MemoirPersona[] = [];
    const accounts: DisposableAccount[] = [];
    const applications: OAuthApplication[] = [];
    let adminApi: Promise<AdminApi> | undefined;

    const track = (ctx: APIRequestContext): APIRequestContext => {
      contexts.push(ctx);
      return ctx;
    };
    const identityAdmin = (): Promise<AdminApi> => (adminApi ??= createAdminApi(clientIp));

    await use({
      clientIp,
      persona: async options => {
        const persona = await createMemoirPersona({ ...options, clientIp });
        personas.push(persona);
        return persona;
      },
      disposableAccount: async label => {
        const account = await createDisposableAccount(label);
        accounts.push(account);
        return account;
      },
      guest: async () => track(await request.newContext({ baseURL: memoirUrl, ignoreHTTPSErrors: true, extraHTTPHeaders: clientIpHeaders(clientIp) })),
      identityCaller: async persona => track(await identitySessionContext(persona.session, { clientIp })),
      identityAnonymous: async () => track(await identityApi(clientIp)),
      identityAdmin,
      createOAuthApp: async label => {
        const application = await createOAuthApplication((await identityAdmin()).ctx, label ?? 'memoir-audience', { withPublicUrl: true });
        applications.push(application);
        return application;
      },
    });

    const pendingAdmin = adminApi;
    await runAll([
      ...applications.map(application => async () => deleteOAuthApplication((await identityAdmin()).ctx, application)),
      ...applications.map(application => () => clearClientRateLimits(application.serviceClient.clientId)),
      ...(pendingAdmin ? [async () => (await pendingAdmin).dispose()] : []),
      ...contexts.map(ctx => () => ctx.dispose()),
      ...personas.map(persona => () => deleteMemoirPersona(persona)),
      ...accounts.map(account => () => deleteDisposableAccount(account)),
      () => clearIpState(clientIp),
    ]);
  },
});

export { expect } from '@playwright/test';
