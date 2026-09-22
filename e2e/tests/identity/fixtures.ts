/**
 * Importing npm packages
 */
import { type APIRequestContext, test as base } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  type AdminApi,
  clearIpState,
  createAdminApi,
  createIdentitySession,
  createIdentityUser,
  createOAuthApplication,
  createOAuthTestClient,
  createTeamOrganisation,
  deleteIdentityUser,
  deleteOAuthApplication,
  deleteOAuthTestClient,
  deleteOrganisation,
  deleteOrgOAuthApp,
  freshClientIp,
  identityApi,
  type IdentitySession,
  identitySessionContext,
  type IdentitySessionOptions,
  type IdentityUser,
  type IdentityUserOptions,
  listOwnedApplicationIds,
  type OAuthApplication,
  type OAuthApplicationOptions,
  type OAuthTestClient,
  type TeamOrganisation,
  type TeamOrganisationOptions,
  updateIdentitySession,
  updateOrganisation,
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
  /** A throwaway application (PUBLIC unless told otherwise); it and every client registered on it are removed after the test. */
  createOAuthApp(label?: string, options?: OAuthApplicationOptions): Promise<OAuthApplication>;
  /** A database-created team organisation with a factory OWNER, removed after the test together with every app it owns. */
  createTeam(options?: TeamOrganisationOptions): Promise<IdentityTeam>;
  /** Removes an organisation the test created some other way (e.g. through the API) after the test, like `createTeam`'s. */
  trackOrganisation(organisationId: string, ownerUserId: string): void;
}

export interface IdentityTeam extends TeamOrganisation {
  readonly owner: IdentityUser;
  /** The owner on a self-service-elevated session, as org-admin routes (assignment, org OAuth apps) require. */
  readonly ownerCtx: APIRequestContext;
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
    const organisations: { organisationId: string; ownerUserId: string }[] = [];
    let adminApi: Promise<AdminApi> | undefined;

    const track = (ctx: APIRequestContext): APIRequestContext => {
      contexts.push(ctx);
      return ctx;
    };
    const contextFor = async (session: IdentitySession): Promise<APIRequestContext> => track(await identitySessionContext(session, { clientIp }));
    const admin = (): Promise<AdminApi> => (adminApi ??= createAdminApi(clientIp));
    const createUser = async (options?: IdentityUserOptions): Promise<IdentityUser> => {
      const user = await createIdentityUser(options);
      users.push(user);
      return user;
    };
    const signIn = async (user: IdentityUser, options?: IdentitySessionOptions): Promise<{ session: IdentitySession; ctx: APIRequestContext }> => {
      const session = await createIdentitySession(user.userId, options);
      return { session, ctx: await contextFor(session) };
    };

    /** Org-owned apps can only be deleted through the org API, and their clients block the organisation's own deletion, so they go first on a fresh owner session. */
    const removeOrganisation = async ({ organisationId, ownerUserId }: { organisationId: string; ownerUserId: string }): Promise<void> => {
      const owned = await listOwnedApplicationIds(organisationId);
      if (owned.length > 0) {
        await updateOrganisation(organisationId, { status: 'ACTIVE' });
        const session = await createIdentitySession(ownerUserId, { aal: 'AAL2' });
        const ctx = await identitySessionContext(session, { clientIp });
        try {
          for (const applicationId of owned) await deleteOrgOAuthApp(ctx, organisationId, applicationId);
        } finally {
          await ctx.dispose();
          await updateIdentitySession(session, { status: 'TERMINATED' });
        }
      }
      await deleteOrganisation(organisationId);
    };

    await use({
      clientIp,
      anonymous: async () => track(await identityApi(clientIp)),
      createUser,
      signIn,
      contextFor,
      admin,
      createOAuthClient: async label => {
        const client = await createOAuthTestClient((await admin()).ctx, label);
        oauthClients.push(client);
        return client;
      },
      createOAuthApp: async (label, options) => {
        const application = await createOAuthApplication((await admin()).ctx, label, options);
        oauthApps.push(application);
        return application;
      },
      createTeam: async options => {
        const owner = await createUser({ label: `${options?.label ?? 'team'}-owner` });
        const team = await createTeamOrganisation(options);
        organisations.push({ organisationId: team.organisationId, ownerUserId: owner.userId });
        await addOrganisationMember(team.organisationId, owner.userId, { role: 'OWNER' });
        const { ctx } = await signIn(owner, { aal: 'AAL2' });
        return { ...team, owner, ownerCtx: ctx };
      },
      trackOrganisation: (organisationId, ownerUserId) => {
        organisations.push({ organisationId, ownerUserId });
      },
    });

    const pendingAdmin = adminApi;
    await runAll([
      ...oauthClients.map(client => async () => deleteOAuthTestClient((await admin()).ctx, client)),
      ...oauthApps.map(application => async () => deleteOAuthApplication((await admin()).ctx, application)),
      ...organisations.map(organisation => () => removeOrganisation(organisation)),
      ...(pendingAdmin ? [async () => (await pendingAdmin).dispose()] : []),
      ...contexts.map(ctx => () => ctx.dispose()),
      ...users.map(user => () => deleteIdentityUser(user)),
      () => clearIpState(clientIp),
    ]);
  },
});

export { expect } from '@playwright/test';
