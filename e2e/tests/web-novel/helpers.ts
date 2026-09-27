/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductUrl, identityDb } from '../../lib';

/**
 * Defining types
 */

export type AppSessionStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface AppSessionRow {
  readonly userId: string;
  readonly clientId: string;
  readonly status: AppSessionStatus;
  readonly terminatedAt: Date | null;
}

type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

export interface WebNovelMutateOptions {
  data?: unknown;
  headers?: Record<string, string>;
  csrfSeedPath?: string;
}

/**
 * Declaring the constants
 */

export const WEB_NOVEL_CLIENT_ID = 'web-novel';

export const WEB_NOVEL_SESSION_COOKIE = '__Host-shadow-session';

export const WEB_NOVEL_LOGIN_STATE_COOKIE = '__Host-shadow-session-login';

export class WebNovelSessionError extends Error {
  override readonly name = 'WebNovelSessionError';
}

/** Follows one hop of the OIDC login chain without following the next, and hands back where it points. */
export async function followRedirect(ctx: APIRequestContext, url: string): Promise<URL> {
  const response = await ctx.get(url, { maxRedirects: 0 });
  const location = response.headers().location;
  if (response.status() !== 302 || !location) throw new WebNovelSessionError(`expected a redirect from ${url}, got ${response.status()} ${await response.text()}`);
  return new URL(location, response.url());
}

/** Identity's `app_sessions` row behind a web-novel handle; identity stores only the handle's SHA-256. */
export async function findAppSession(handle: string): Promise<AppSessionRow | undefined> {
  const sessionHash = createHash('sha256').update(handle).digest('hex');
  const [row] = await identityDb()<AppSessionRow[]>`
    SELECT user_id::text AS "userId", client_id AS "clientId", status, terminated_at AS "terminatedAt" FROM app_sessions WHERE session_hash = ${sessionHash}
  `;
  return row;
}

export async function countActiveAppSessions(userId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM app_sessions WHERE user_id = ${userId} AND client_id = ${WEB_NOVEL_CLIENT_ID} AND status = 'ACTIVE'
  `;
  return row?.count ?? 0;
}

/** Every web-novel app session identity ever minted for `userId`, whatever its status. */
export async function countAppSessions(userId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM app_sessions WHERE user_id = ${userId} AND client_id = ${WEB_NOVEL_CLIENT_ID}`;
  return row?.count ?? 0;
}

/**
 * A web-novel-scoped replacement for `lib/api.ts`'s `mutate`. That shared helper's `readCsrfToken` picks the
 * *first* cookie named `csrf-token` in the whole jar (`cookies.find(c => c.name === 'csrf-token')`) with no
 * domain filter — fine for a single-app persona, but every persona this suite seeds a storage state for
 * (`user1`/`user2`) carries a `csrf-token` cookie per app it's signed into (novel-forge *and* web-novel), so the
 * lookup nondeterministically grabs a foreign-origin cookie and the echoed `x-csrf-token` header never matches
 * web-novel's own cookie. The server then rejects the request outright with `403 {"code":"S010", ...}` (a WAF/
 * security-policy block, not a domain error) before it ever reaches app logic — confirmed by direct `curl` with
 * web-novel's own cookie succeeding, and by inspecting `ctx.storageState()` mid-test and finding three same-named
 * `csrf-token` cookies, one per origin. `lib/` is out of this spec directory's ownership, so this file fixes it
 * locally by filtering the cookie jar to the web-novel origin before reading the token half.
 */
export async function webNovelMutate(ctx: APIRequestContext, method: MutationMethod, url: string, options: WebNovelMutateOptions = {}): Promise<APIResponse> {
  await ctx.get(options.csrfSeedPath ?? '/api/auth/session');

  const webNovelOrigin = new URL(getProductUrl('webNovel') ?? 'https://webnovel.shadow-apps.test').hostname;
  const { cookies } = await ctx.storageState();
  const cookie = cookies.find(c => c.name === 'csrf-token' && c.domain.replace(/^\./, '') === webNovelOrigin);
  const token = cookie?.value.split(':')[1];

  const headers = { ...(token ? { 'x-csrf-token': token } : {}), ...options.headers };
  return ctx[method](url, { headers, ...(options.data === undefined ? {} : { data: options.data }) });
}
