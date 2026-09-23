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
  botApi,
  type BotApiOptions,
  clearIpState,
  createAdminApi,
  type CreateBotOptions,
  createIdentitySession,
  createIdentityUser,
  createOAuthApplication,
  createOAuthTestClient,
  createOrganisationBot,
  createSamlSp,
  createTeamOrganisation,
  createWebhook,
  deleteIdentityUser,
  deleteOAuthApplication,
  deleteOAuthTestClient,
  deleteOrganisation,
  deleteOrganisationBotRecord,
  deleteOrgOAuthApp,
  deleteSamlSpRecord,
  deleteWebhookRecord,
  findIdentityUserByEmail,
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
  type OrganisationBot,
  type OrganisationRole,
  type OrgOAuthApp,
  registerOAuthClient,
  type RegisterOAuthClientOptions,
  registerOrgOAuthApp,
  type RegisterOrgOAuthAppOptions,
  type SamlSp,
  type SamlSpOptions,
  type SeedBotsOptions,
  seedOrganisationBots,
  type TeamOrganisation,
  type TeamOrganisationOptions,
  updateIdentitySession,
  updateOrganisation,
  type WebhookOptions,
  type WebhookSubscription,
} from '../../lib';

/**
 * Defining types
 */

export interface IdentityHarness {
  /** This test's own client address; every context below is charged to it. */
  readonly clientIp: string;
  /** A fresh cookie-less identity context. Use a new one per login: a completed login leaves `__Host-sid` in the jar. */
  anonymous(): Promise<APIRequestContext>;
  /** A caller authenticated by nothing but `Authorization: Bearer sl_bot_…`, and cookie-less, since a session cookie puts CSRF in front of the bot guard. */
  botCaller(key: string, options?: BotApiOptions): Promise<APIRequestContext>;
  /** A factory user, deleted after the test. */
  createUser(options?: IdentityUserOptions): Promise<IdentityUser>;
  /** A database-minted session for `user` and an identity context carrying it. */
  signIn(user: IdentityUser, options?: IdentitySessionOptions): Promise<{ session: IdentitySession; ctx: APIRequestContext }>;
  /** An identity context carrying an existing session. */
  contextFor(session: IdentitySession): Promise<APIRequestContext>;
  /** The elevated bootstrap admin, minted once per test and terminated after it. */
  admin(): Promise<AdminApi>;
  /** A further bootstrap-admin caller at a chosen assurance level, terminated after the test — for the routes that separate reads from mutations. */
  adminAt(options: IdentitySessionOptions): Promise<AdminApi>;
  /** A SAML service provider registered through the admin API, removed after the test. */
  createSamlSp(options?: SamlSpOptions): Promise<SamlSp>;
  /** Removes a service provider the test registered some other way after the test, like `createSamlSp`'s. */
  trackSamlSp(serviceProviderId: string): void;
  /** An admin webhook subscription — by default on a target the SSRF guard refuses at delivery — removed, with its deliveries, after the test. */
  createWebhook(options?: WebhookOptions): Promise<WebhookSubscription>;
  /** A throwaway PUBLIC application with a first-party public client, removed after the test. */
  createOAuthClient(label?: string): Promise<OAuthTestClient>;
  /** A throwaway application (PUBLIC unless told otherwise); it and every client registered on it are removed after the test. */
  createOAuthApp(label?: string, options?: OAuthApplicationOptions): Promise<OAuthApplication>;
  /** A further client on a tracked application, removed with it. */
  createOAuthClientOn(application: OAuthApplication, options?: RegisterOAuthClientOptions): Promise<OAuthTestClient>;
  /** An organisation-owned (RESTRICTED, third-party) OAuth app, removed with its organisation. */
  createOrgOAuthApp(team: IdentityTeam, options?: RegisterOrgOAuthAppOptions): Promise<OrgOAuthApp>;
  /** Removes an application the test created through the API after the test, like `createOAuthApp`'s. */
  trackApplication(applicationId: number, name: string): void;
  /** A bot of `team`, created through the API by its elevated owner and removed — with its client and grants — after the test. */
  createBot(team: IdentityTeam, options?: CreateBotOptions): Promise<OrganisationBot>;
  /** `count` database-inserted bots of `team`, for the states a scenario cannot afford to reach one API call at a time. */
  seedBots(team: IdentityTeam, count: number, options?: SeedBotsOptions): Promise<OrganisationBot[]>;
  /** Removes a bot the test created some other way after the test, like `createBot`'s. */
  trackBot(bot: OrganisationBot): void;
  /** A database-created team organisation with a factory OWNER, removed after the test together with every app it owns. */
  createTeam(options?: TeamOrganisationOptions): Promise<IdentityTeam>;
  /** Removes an organisation the test created some other way (e.g. through the API) after the test, like `createTeam`'s. */
  trackOrganisation(organisationId: string, ownerUserId: string): void;
  /** Removes the user holding `email` after the test, if one exists by then — for accounts a spec registers through the API or UI. */
  trackUserByEmail(email: string): void;
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

export interface IdentityTeamMember {
  readonly user: IdentityUser;
  /** A stepped-up session, since most of what a member is refused is refused for the role rather than the assurance level. */
  readonly ctx: APIRequestContext;
}

/** A factory user joined to `team` at `role`, signed in and torn down with the rest of the harness. */
export async function teamMember(identity: IdentityHarness, team: IdentityTeam, label: string, role: OrganisationRole): Promise<IdentityTeamMember> {
  const user = await identity.createUser({ label });
  await addOrganisationMember(team.organisationId, user.userId, { role });
  const { ctx } = await identity.signIn(user, { aal: 'AAL2' });
  return { user, ctx };
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
    const bots: OrganisationBot[] = [];
    const samlSps: string[] = [];
    const webhooks: string[] = [];
    const registeredEmails: string[] = [];
    const extraAdmins: AdminApi[] = [];
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
      botCaller: async (key, options) => track(await botApi(key, clientIp, options)),
      createUser,
      signIn,
      contextFor,
      admin,
      adminAt: async options => {
        const api = await createAdminApi(clientIp, options);
        extraAdmins.push(api);
        return api;
      },
      createSamlSp: async options => {
        const serviceProvider = await createSamlSp((await admin()).ctx, options);
        samlSps.push(serviceProvider.id);
        return serviceProvider;
      },
      trackSamlSp: serviceProviderId => {
        samlSps.push(serviceProviderId);
      },
      createWebhook: async options => {
        const subscription = await createWebhook((await admin()).ctx, options);
        webhooks.push(subscription.id);
        return subscription;
      },
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
      createOAuthClientOn: async (application, options) => registerOAuthClient((await admin()).ctx, application, options),
      createOrgOAuthApp: (team, options) => registerOrgOAuthApp(team.ownerCtx, team.organisationId, options),
      trackApplication: (applicationId, name) => {
        oauthApps.push({ applicationId, name, audience: `api://${name}`, serviceClient: { clientId: name } });
      },
      createBot: async (team, options) => {
        const bot = await createOrganisationBot(team.ownerCtx, team.organisationId, options);
        bots.push(bot);
        return bot;
      },
      seedBots: async (team, count, options) => {
        const seeded = await seedOrganisationBots(team.organisationId, count, { createdBy: team.owner.userId, ...options });
        bots.push(...seeded);
        return seeded;
      },
      trackBot: bot => {
        bots.push(bot);
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
      trackUserByEmail: email => {
        registeredEmails.push(email);
      },
    });

    const pendingAdmin = adminApi;
    await runAll([
      ...samlSps.map(serviceProviderId => () => deleteSamlSpRecord(serviceProviderId)),
      ...webhooks.map(webhookId => () => deleteWebhookRecord(webhookId)),
      ...oauthClients.map(client => async () => deleteOAuthTestClient((await admin()).ctx, client)),
      ...oauthApps.map(application => async () => deleteOAuthApplication((await admin()).ctx, application)),
      // Before the organisations: a bot's client is `ON DELETE restrict`, so an organisation taken down first strands it.
      ...bots.map(bot => () => deleteOrganisationBotRecord(bot)),
      ...organisations.map(organisation => () => removeOrganisation(organisation)),
      ...(pendingAdmin ? [async () => (await pendingAdmin).dispose()] : []),
      ...extraAdmins.map(api => () => api.dispose()),
      ...contexts.map(ctx => () => ctx.dispose()),
      ...users.map(user => () => deleteIdentityUser(user)),
      ...registeredEmails.map(email => async () => {
        const user = await findIdentityUserByEmail(email);
        if (user) await deleteIdentityUser(user);
      }),
      () => clearIpState(clientIp),
    ]);
  },
});

export { expect } from '@playwright/test';
