/**
 * Importing npm packages
 */
import { type APIRequestContext, test as base } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  type AdminApi,
  clearIpState,
  createAdminApi,
  createIdentitySession,
  createIdentityUser,
  createOAuthApplication,
  createOAuthTestClient,
  deleteIdentityUser,
  deleteOAuthApplication,
  deleteOAuthTestClient,
  freshClientIp,
  identityApi,
  type IdentitySession,
  identitySessionContext,
  type IdentitySessionOptions,
  type IdentityUser,
  type IdentityUserOptions,
  type OAuthApplication,
  type OAuthTestClient,
} from '../../lib';

/**
 * Defining types
 */

export interface IdentityHarness {
  /** This test's own client address; every context below is charged to it. */
  readonly clientIp: string;
  /** A fresh cookie-less identity context. Use a new one per login: a completed login leaves `__Host-sid` in the jar. */
  anonymous(): Promise<APIRequestContext>;
  /** A factory user, deleted after the test. */
  createUser(options?: IdentityUserOptions): Promise<IdentityUser>;
  /** A database-minted session for `user` and an identity context carrying it. */
  signIn(user: IdentityUser, options?: IdentitySessionOptions): Promise<{ session: IdentitySession; ctx: APIRequestContext }>;
  /** An identity context carrying an existing session. */
  contextFor(session: IdentitySession): Promise<APIRequestContext>;
  /** The elevated bootstrap admin, minted once per test and terminated after it. */
  admin(): Promise<AdminApi>;
  /** A throwaway PUBLIC application with a first-party public client, removed after the test. */
  createOAuthClient(label?: string): Promise<OAuthTestClient>;
  /** A throwaway PUBLIC application; it and every client registered on it are removed after the test. */
  createOAuthApp(label?: string): Promise<OAuthApplication>;
}

/**
 * Declaring the constants
 */

export class HarnessTeardownError extends AggregateError {
  override readonly name = 'HarnessTeardownError';
}

/** Runs every step even when earlier ones fail, then surfaces all failures together. */
async function runAll(steps: (() => Promise<unknown>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) await step().catch((error: unknown) => errors.push(error));
  if (errors.length > 0) throw new HarnessTeardownError(errors, `identity harness teardown failed in ${errors.length} step(s)`);
}

export const test = base.extend<{ identity: IdentityHarness }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  identity: async ({}, use) => {
    const clientIp = await freshClientIp();
    const contexts: APIRequestContext[] = [];
    const users: IdentityUser[] = [];
    const oauthClients: OAuthTestClient[] = [];
    const oauthApps: OAuthApplication[] = [];
    let adminApi: Promise<AdminApi> | undefined;

    const track = (ctx: APIRequestContext): APIRequestContext => {
      contexts.push(ctx);
      return ctx;
    };
    const contextFor = async (session: IdentitySession): Promise<APIRequestContext> => track(await identitySessionContext(session, { clientIp }));
    const admin = (): Promise<AdminApi> => (adminApi ??= createAdminApi(clientIp));

    await use({
      clientIp,
      anonymous: async () => track(await identityApi(clientIp)),
      createUser: async options => {
        const user = await createIdentityUser(options);
        users.push(user);
        return user;
      },
      signIn: async (user, options) => {
        const session = await createIdentitySession(user.userId, options);
        return { session, ctx: await contextFor(session) };
      },
      contextFor,
      admin,
      createOAuthClient: async label => {
        const client = await createOAuthTestClient((await admin()).ctx, label);
        oauthClients.push(client);
        return client;
      },
      createOAuthApp: async label => {
        const application = await createOAuthApplication((await admin()).ctx, label);
        oauthApps.push(application);
        return application;
      },
    });

    const pendingAdmin = adminApi;
    await runAll([
      ...oauthClients.map(client => async () => deleteOAuthTestClient((await admin()).ctx, client)),
      ...oauthApps.map(application => async () => deleteOAuthApplication((await admin()).ctx, application)),
      ...(pendingAdmin ? [async () => (await pendingAdmin).dispose()] : []),
      ...contexts.map(ctx => () => ctx.dispose()),
      ...users.map(user => () => deleteIdentityUser(user)),
      () => clearIpState(clientIp),
    ]);
  },
});

export { expect } from '@playwright/test';
