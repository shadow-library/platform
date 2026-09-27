/**
 * Importing npm packages
 */
import { type APIRequestContext, test as base, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  clearIpState,
  clientIpHeaders,
  createIdentitySession,
  createIdentityUser,
  deleteIdentityUser,
  evictSessionCache,
  findSetCookie,
  freshClientIp,
  type IdentitySession,
  identityStorageState,
  type IdentityUser,
  requireProductUrl,
  runAll,
} from '../../lib';
import { deleteReaderData, followRedirect, WEB_NOVEL_SESSION_COOKIE, WebNovelSessionError } from './helpers';

/**
 * Defining types
 */

export interface WebNovelReader {
  readonly user: IdentityUser;
  /** The central identity session every OIDC hop for this reader rides on. */
  readonly session: IdentitySession;
}

export interface SignedInReader {
  /** A web-novel context carrying the reader's `__Host-shadow-session`, and identity's cookies for another hop. */
  readonly ctx: APIRequestContext;
  readonly handle: string;
}

export interface WebNovelHarness {
  /** This test's own client address; the identity side of every OIDC hop is charged to it. */
  readonly clientIp: string;
  /** A factory identity user with a live central session and no web-novel session yet. */
  reader(label?: string): Promise<WebNovelReader>;
  guest(): Promise<APIRequestContext>;
  /** A web-novel context carrying only `reader`'s identity cookies, for driving the login flow by hand. */
  preLogin(reader: WebNovelReader): Promise<APIRequestContext>;
  /** Walks the real login → authorize → callback chain, so each call mints a new app session. */
  signIn(reader: WebNovelReader, returnTo?: string): Promise<SignedInReader>;
}

/**
 * Declaring the constants
 *
 * Readers are built per test rather than taken from the saved personas: logging out revokes the handle a persona's
 * storage state carries, which every other web-novel spec reads. Each reader's central session is written straight into
 * identity, so a test spends no `login/init` budget, and the chain is walked hop by hop so it never renders the SSR page
 * the callback lands on. Deleting the user cascades its central and app sessions; web-novel keys its shelves and progress by the bare
 * subject, so those are removed by hand.
 */

export const test = base.extend<{ webNovel: WebNovelHarness }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  webNovel: async ({}, use) => {
    const baseURL = requireProductUrl('webNovel');
    const clientIp = await freshClientIp();
    const contexts: APIRequestContext[] = [];
    const readers: WebNovelReader[] = [];
    const users: IdentityUser[] = [];

    const newContext = async (session?: IdentitySession): Promise<APIRequestContext> => {
      const storageState = session ? identityStorageState(session) : undefined;
      const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState, extraHTTPHeaders: clientIpHeaders(clientIp) });
      contexts.push(ctx);
      return ctx;
    };

    await use({
      clientIp,
      reader: async label => {
        const user = await createIdentityUser({ label: `webnovel-${label ?? 'reader'}` });
        users.push(user);
        const reader = { user, session: await createIdentitySession(user.userId) };
        readers.push(reader);
        return reader;
      },
      guest: () => newContext(),
      preLogin: reader => newContext(reader.session),
      signIn: async (reader, returnTo = '/') => {
        const ctx = await newContext(reader.session);
        const authorize = await followRedirect(ctx, `/api/auth/login?${new URLSearchParams({ return_to: returnTo })}`);
        const callback = await followRedirect(ctx, authorize.href);
        const redeemed = await ctx.get(callback.href, { maxRedirects: 0 });
        const handle = findSetCookie(redeemed, WEB_NOVEL_SESSION_COOKIE)?.value;
        if (redeemed.status() !== 302 || !handle) throw new WebNovelSessionError(`no web-novel session for ${reader.user.email}: callback answered ${redeemed.status()}`);
        return { ctx, handle };
      },
    });

    await runAll([
      ...contexts.map(ctx => () => ctx.dispose()),
      ...readers.map(reader => () => evictSessionCache(reader.session.secret)),
      () => deleteReaderData(users.map(user => user.userId)),
      ...users.map(user => () => deleteIdentityUser(user)),
      () => clearIpState(clientIp),
    ]);
  },
});

export { expect } from '@playwright/test';
