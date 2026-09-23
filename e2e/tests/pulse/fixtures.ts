/**
 * Importing npm packages
 */
import { type APIRequestContext, test as base, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  type AdminApi,
  apiContext,
  clientIpHeaders,
  createAdminApi,
  createOAuthApplication,
  createPulseStaff,
  deleteOAuthApplication,
  deletePulseStaff,
  freshClientIp,
  identityApi,
  identitySessionContext,
  identityStorageState,
  type OAuthApplication,
  type PulseStaff,
  type PulseStaffOptions,
  requireProductUrl,
  runAll,
} from '../../lib';
import { deactivateTemplate, deleteNotificationJobs } from './helpers';

/**
 * Defining types
 */

export interface PulseHarness {
  /** This test's own client address; every identity-facing call below is charged to it. */
  readonly clientIp: string;
  /** The seeded bootstrap admin's pulse context (`PulseAdmin`), for arranging templates the test owns. */
  admin(): Promise<APIRequestContext>;
  /** A cookie-less pulse context — an unauthenticated caller, or one presenting only a bearer token. */
  guest(): Promise<APIRequestContext>;
  /** A platform-organisation staff account with a live pulse session and exactly the permissions asked for. */
  staff(options?: Omit<PulseStaffOptions, 'clientIp'>): Promise<PulseStaff>;
  /** A pulse context carrying `staff`'s identity cookies but no pulse session, for driving the login flow by hand. */
  preLogin(staff: PulseStaff): Promise<APIRequestContext>;
  /** An identity context signed in as `staff`, for the OAuth calls that ride a session. */
  identityCaller(staff: PulseStaff): Promise<APIRequestContext>;
  /** A cookie-less identity context — the token endpoint refuses a cookie-carrying caller with `S010` (CSRF). */
  identityAnonymous(): Promise<APIRequestContext>;
  /** An identity admin caller, for the OAuth application a cross-audience token is minted from. */
  identityAdmin(): Promise<AdminApi>;
  /** A throwaway PUBLIC application with its own `api://` audience and a redirecting first-party client. */
  createOAuthApp(label?: string): Promise<OAuthApplication>;
  /** Deactivates `templateId` after the test — templates have no DELETE route. */
  trackTemplate(templateId: string): void;
  /** Removes these `notification_jobs` rows, and the `notification_messages` rows hanging off them, after the test. */
  trackJobs(...jobIds: string[]): void;
}

/**
 * Declaring the constants
 *
 * The pulse harness. Every account, context and row a test arranges is tracked here and removed afterwards even
 * when an earlier teardown step throws, so a test that fails halfway leaves the deployment as it found it. The
 * personas are built fresh per test rather than shared: a pulse permission is resolved by identity's PDP and
 * cached per subject in the pulse pod, so a reused subject would carry a previous test's decision.
 */

export const test = base.extend<{ pulse: PulseHarness }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  pulse: async ({}, use) => {
    const pulseUrl = requireProductUrl('pulse');
    const clientIp = await freshClientIp();
    const contexts: APIRequestContext[] = [];
    const staffAccounts: PulseStaff[] = [];
    const applications: OAuthApplication[] = [];
    const templateIds: string[] = [];
    const jobIds: string[] = [];
    let adminApi: Promise<AdminApi> | undefined;
    let pulseAdmin: Promise<APIRequestContext> | undefined;

    const track = (ctx: APIRequestContext): APIRequestContext => {
      contexts.push(ctx);
      return ctx;
    };
    const identityAdmin = (): Promise<AdminApi> => (adminApi ??= createAdminApi(clientIp));
    const admin = (): Promise<APIRequestContext> => (pulseAdmin ??= apiContext('pulse', 'admin').then(track));

    await use({
      clientIp,
      admin,
      guest: async () => track(await request.newContext({ baseURL: pulseUrl, ignoreHTTPSErrors: true, extraHTTPHeaders: clientIpHeaders(clientIp) })),
      staff: async options => {
        const staff = await createPulseStaff({ ...options, clientIp });
        staffAccounts.push(staff);
        return staff;
      },
      preLogin: async staff =>
        track(
          await request.newContext({
            baseURL: pulseUrl,
            ignoreHTTPSErrors: true,
            storageState: identityStorageState(staff.session),
            extraHTTPHeaders: clientIpHeaders(clientIp),
          }),
        ),
      identityCaller: async staff => track(await identitySessionContext(staff.session, { clientIp })),
      identityAnonymous: async () => track(await identityApi(clientIp)),
      identityAdmin,
      createOAuthApp: async label => {
        const application = await createOAuthApplication((await identityAdmin()).ctx, label ?? 'pulse-audience', { withPublicUrl: true });
        applications.push(application);
        return application;
      },
      trackTemplate: templateId => {
        templateIds.push(templateId);
      },
      trackJobs: (...ids) => {
        jobIds.push(...ids);
      },
    });

    const pendingAdmin = adminApi;
    await runAll([
      () => deleteNotificationJobs(jobIds),
      ...templateIds.map(templateId => async () => deactivateTemplate(await admin(), templateId)),
      ...applications.map(application => async () => deleteOAuthApplication((await identityAdmin()).ctx, application)),
      ...(pendingAdmin ? [async () => (await pendingAdmin).dispose()] : []),
      ...contexts.map(ctx => () => ctx.dispose()),
      ...staffAccounts.map(staff => () => deletePulseStaff(staff)),
    ]);
  },
});

export { expect } from '@playwright/test';
