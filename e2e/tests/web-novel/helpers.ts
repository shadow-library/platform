/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductUrl } from '../../lib';

/**
 * Defining types
 */

type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

export interface WebNovelMutateOptions {
  data?: unknown;
  headers?: Record<string, string>;
  csrfSeedPath?: string;
}

/**
 * Declaring the constants
 *
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
