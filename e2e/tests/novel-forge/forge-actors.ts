/**
 * Importing npm packages
 */
import { type APIRequestContext, test as base, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  assignApplicationRole,
  botApi,
  clearIpState,
  clientIpHeaders,
  createIdentitySession,
  createIdentityUser,
  createOrganisationBot,
  createTeamOrganisation,
  deleteIdentityUser,
  deleteOrganisation,
  deleteOrganisationBotRecord,
  deleteRoleAssignmentsFor,
  findApplicationIdByName,
  findApplicationRoleId,
  freshClientIp,
  identityDb,
  type IdentitySession,
  identitySessionContext,
  identityStorageState,
  type IdentityUser,
  issueBotKey,
  mutate,
  type OrganisationBot,
  type OrganisationRole,
  pollUntil,
  redisDel,
  replaceBotPermissions,
  requireProductUrl,
  runAll,
  type TeamOrganisation,
} from '../../lib';
import { deleteAccountSettings, deleteForgeProjects, deleteForgeProjectsOwnedBy, type ForgeOwner, type QuotaLimits, quotaPin, readQuotaLimits } from './forge-db';

/**
 * Defining types
 */

export type ForgeRole = 'NovelForgeCurator' | 'NovelForgeAdmin';

/** One bot grant as the permission catalog offers it; `projects:write` carries `projects:read` with it. */
export type ForgeBotGrant = 'projects:read' | 'projects:write' | 'generation' | 'illustrations';

export interface ForgeActorOptions {
  /** Readable tag embedded in the generated email. */
  label?: string;
  /** A team organisation to join; the actor's session is switched into it, so it acts and is authorised there. */
  organisation?: Pick<TeamOrganisation, 'organisationId'>;
  /** Default `MEMBER`. */
  memberRole?: OrganisationRole;
  /** Novel Forge roles held in the organisation the actor acts in (the team when given, else the personal organisation). */
  roles?: readonly ForgeRole[];
  /** Caps identity's access-token lifetime for the actor's personal organisation, so Novel Forge never caches a minted token. */
  accessTokenTtlSeconds?: number;
}

export interface ForgeActor {
  readonly user: IdentityUser;
  readonly session: IdentitySession;
  /** A Novel Forge context carrying the actor's app session (and identity's cookies, for a re-hop). */
  readonly ctx: APIRequestContext;
  readonly owner: ForgeOwner;
  /** The organisation the actor's Novel Forge session acts in. */
  readonly organisationId: string;
}

export interface ForgeTeam extends TeamOrganisation {
  readonly owner: IdentityUser;
  /** The owner on an elevated identity session, as bot management requires. */
  readonly ownerCtx: APIRequestContext;
}

export interface ForgeBot extends OrganisationBot {
  /** A cookie-less Novel Forge caller presenting nothing but the bot's key. */
  readonly ctx: APIRequestContext;
  readonly owner: ForgeOwner;
}

export interface ForgeHarness {
  /** This test's own client address; identity charges every hop and exchange below to it. */
  readonly clientIp: string;
  /** A factory user signed in to Novel Forge, removed with every project and setting it owns after the test. */
  actor(options?: ForgeActorOptions): Promise<ForgeActor>;
  /** A team organisation with an elevated owner, removed after the test once its bots are gone. */
  team(label?: string): Promise<ForgeTeam>;
  /** A bot of `team` holding exactly `grants`, removed with every project it owns after the test. */
  bot(team: ForgeTeam, grants: readonly ForgeBotGrant[], label?: string): Promise<ForgeBot>;
  /** A Novel Forge context with no credential at all. */
  anonymous(): Promise<APIRequestContext>;
  /** An identity context on the actor's own session, charged to this test's address. */
  identity(actor: ForgeActor): Promise<APIRequestContext>;
  /** Removes a project the test created for an owner the harness does not track (a seeded persona) after the test. */
  trackProject(projectId: string): void;
  /** The server's AI quota window, read once per worker through this test's first actor — creating a `quota-reader` actor when there is none. */
  quotaLimits(): Promise<QuotaLimits>;
  /**
   * Stands the project's owner — an actor or bot this harness created, never anyone else — at the AI_008 call ceiling for the rest of the
   * test, and tracks the project for teardown. The default guard before any model-capable request; it may create a `quota-reader` actor.
   */
  quotaPin(projectId: string): Promise<void>;
}

/**
 * Declaring the constants
 *
 * Novel Forge callers that belong to one test and nothing else. The web-novel lane's seed deletes every project owned by a seeded
 * persona at the start of its runs, so a spec's projects must never be owned by one: an actor here is a fresh identity user whose
 * app session comes from the same OIDC hop a browser makes, driven over an `APIRequestContext` that starts out with nothing but a
 * database-minted identity session. A bot is created through identity's organisation API by the team's elevated owner, granted the
 * Novel Forge resources it is meant to hold, and calls with its `sl_bot_…` key alone.
 *
 * Novel Forge keeps nothing that cascades from identity, so teardown removes the owner's projects (by owner kind and id, which is
 * how the server scopes them), its saved settings and its role assignments before the identity account goes.
 */

const NOVEL_FORGE_APPLICATION = 'novel-forge';

const BOT_GRANTS: Record<ForgeBotGrant, { resource: string; level: 'read' | 'write' }> = {
  'projects:read': { resource: 'projects', level: 'read' },
  'projects:write': { resource: 'projects', level: 'write' },
  generation: { resource: 'generation', level: 'write' },
  illustrations: { resource: 'illustrations', level: 'write' },
};

/** What Novel Forge answers when identity throttled the app-session call behind a login or an organisation switch. */
const IDENTITY_THROTTLED = 503;

/** Past one full rate-limit window, with room for the request that finally lands. */
const THROTTLE_RETRY_MS = 75_000;

/** Enough for a test to wait out a throttled window once, on top of its own work. */
const HARNESS_TIMEOUT_MS = 180_000;

export class ForgeActorError extends Error {
  override readonly name = 'ForgeActorError';
}

async function setAccessTokenTtl(organisationId: string, seconds: number): Promise<void> {
  await identityDb()`
    INSERT INTO organisation_policies (organisation_id, policy_key, policy_value, updated_at)
    VALUES (${organisationId}, 'auth.access_token.ttl', ${seconds}::text::jsonb, now())
    ON CONFLICT (organisation_id, policy_key) DO UPDATE SET policy_value = EXCLUDED.policy_value, updated_at = now()
  `;
  await redisDel(`org_policy:${organisationId}`);
}

async function clearAccessTokenTtl(organisationId: string): Promise<void> {
  await identityDb()`DELETE FROM organisation_policies WHERE organisation_id = ${organisationId} AND policy_key = 'auth.access_token.ttl'`;
  await redisDel(`org_policy:${organisationId}`);
}

/**
 * Novel Forge opens and switches app sessions through identity's `/api/v1/app-sessions` and exchanges bot keys at its token endpoint,
 * which identity charges to the one pod address every caller of Novel Forge shares, at 100 a minute. A 503 there is that budget running
 * out, not a verdict on the actor, so the step is retried into the next window. Once exchanged, a bot's token is cached for the test.
 */
export async function untilIdentityAdmits<T extends { status(): number }>(step: () => Promise<T>): Promise<T> {
  return pollUntil(step, response => response.status() !== IDENTITY_THROTTLED, { timeoutMs: THROTTLE_RETRY_MS, intervalMs: 5_000 });
}

/** Rides the identity session through Novel Forge's login into an app session, optionally switched into another organisation. */
async function signInToForge(session: IdentitySession, clientIp: string, switchTo?: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    baseURL: requireProductUrl('novelForge'),
    ignoreHTTPSErrors: true,
    storageState: identityStorageState(session),
    extraHTTPHeaders: clientIpHeaders(clientIp),
  });
  try {
    const hop = await untilIdentityAdmits(() => ctx.get('/api/auth/login?return_to=/'));
    const probe = await ctx.get('/api/auth/session');
    if (!probe.ok()) throw new ForgeActorError(`no Novel Forge session after the OIDC hop (login ${hop.status()}, session ${probe.status()} ${await probe.text()})`);
    if (!switchTo) return ctx;

    const switched = await untilIdentityAdmits(() => mutate(ctx, 'post', '/api/auth/organisation', { data: { organisationId: switchTo } }));
    if (switched.status() !== 200) throw new ForgeActorError(`switching into organisation ${switchTo} answered ${switched.status()}: ${await switched.text()}`);
    return ctx;
  } catch (error) {
    await ctx.dispose();
    throw error;
  }
}

export const test = base.extend<{ forge: ForgeHarness }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  forge: async ({}, use, testInfo) => {
    const allowThrottling = (): void => testInfo.setTimeout(Math.max(testInfo.timeout, HARNESS_TIMEOUT_MS));
    const clientIp = await freshClientIp();
    const actors: ForgeActor[] = [];
    const policies: string[] = [];
    const contexts: APIRequestContext[] = [];
    const users: IdentityUser[] = [];
    const bots: OrganisationBot[] = [];
    const teams: string[] = [];
    const projects: string[] = [];

    const track = (ctx: APIRequestContext): APIRequestContext => {
      contexts.push(ctx);
      return ctx;
    };

    const actor = async (options: ForgeActorOptions = {}): Promise<ForgeActor> => {
      allowThrottling();
      const user = await createIdentityUser({ label: `forge-${options.label ?? 'actor'}` });
      users.push(user);
      const organisationId = options.organisation?.organisationId ?? user.personalOrgId;
      if (options.organisation) await addOrganisationMember(organisationId, user.userId, { role: options.memberRole ?? 'MEMBER' });
      for (const role of options.roles ?? [])
        await assignApplicationRole({ type: 'USER', id: user.userId }, await findApplicationRoleId(NOVEL_FORGE_APPLICATION, role), organisationId);
      if (options.accessTokenTtlSeconds !== undefined) {
        policies.push(user.personalOrgId);
        await setAccessTokenTtl(user.personalOrgId, options.accessTokenTtlSeconds);
      }

      const session = await createIdentitySession(user.userId);
      const ctx = track(await signInToForge(session, clientIp, options.organisation?.organisationId));
      const created: ForgeActor = { user, session, ctx, owner: { kind: 'user', id: user.userId }, organisationId };
      actors.push(created);
      return created;
    };

    const quotaReader = async (): Promise<APIRequestContext> => actors[0]?.ctx ?? (await actor({ label: 'quota-reader' })).ctx;
    const quotaLimits = (): Promise<QuotaLimits> => readQuotaLimits(quotaReader);

    const team = async (label = 'team'): Promise<ForgeTeam> => {
      allowThrottling();
      const owner = await createIdentityUser({ label: `forge-${label}-owner` });
      users.push(owner);
      const organisation = await createTeamOrganisation({ label: `forge-${label}` });
      teams.push(organisation.organisationId);
      await addOrganisationMember(organisation.organisationId, owner.userId, { role: 'OWNER' });
      const session = await createIdentitySession(owner.userId, { aal: 'AAL2' });
      return { ...organisation, owner, ownerCtx: track(await identitySessionContext(session, { clientIp })) };
    };

    const bot = async (owningTeam: ForgeTeam, grants: readonly ForgeBotGrant[], label = 'bot'): Promise<ForgeBot> => {
      const created = await createOrganisationBot(owningTeam.ownerCtx, owningTeam.organisationId, { label: `forge-${label}` });
      bots.push(created);
      const applicationId = await findApplicationIdByName(NOVEL_FORGE_APPLICATION);
      await replaceBotPermissions(
        owningTeam.ownerCtx,
        created,
        grants.map(grant => ({ applicationId, ...BOT_GRANTS[grant] })),
      );
      const { key } = await issueBotKey(owningTeam.ownerCtx, created);
      const ctx = track(await botApi(key, clientIp, { product: 'novelForge' }));
      const readsProjects = grants.includes('projects:read') || grants.includes('projects:write');
      const exchanged = await untilIdentityAdmits(() => ctx.get('/api/v1/projects?limit=1'));
      if (exchanged.status() !== (readsProjects ? 200 : 403)) throw new ForgeActorError(`the key of ${created.handle} answered ${exchanged.status()}: ${await exchanged.text()}`);
      return { ...created, ctx, owner: { kind: 'bot', id: created.botId } };
    };

    await use({
      clientIp,
      actor,
      team,
      bot,
      anonymous: async () => track(await request.newContext({ baseURL: requireProductUrl('novelForge'), ignoreHTTPSErrors: true, extraHTTPHeaders: clientIpHeaders(clientIp) })),
      identity: async forgeActor => track(await identitySessionContext(forgeActor.session, { clientIp })),
      trackProject: projectId => {
        projects.push(projectId);
      },
      quotaLimits,
      quotaPin: async projectId => {
        const owners: ForgeOwner[] = [...users.map(user => ({ kind: 'user' as const, id: user.userId })), ...bots.map(created => ({ kind: 'bot' as const, id: created.botId }))];
        const ownerCtx = (owner: ForgeOwner): APIRequestContext | undefined => actors.find(candidate => owner.kind === 'user' && candidate.owner.id === owner.id)?.ctx;
        await quotaPin(projectId, await quotaLimits(), { owners, reader: quotaReader, ownerCtx });
        projects.push(projectId);
      },
    });

    await runAll([
      ...contexts.map(ctx => () => ctx.dispose()),
      () => deleteForgeProjects(projects),
      ...bots.map(created => () => deleteForgeProjectsOwnedBy({ kind: 'bot', id: created.botId })),
      ...bots.map(created => () => deleteOrganisationBotRecord(created)),
      ...users.map(user => () => deleteForgeProjectsOwnedBy({ kind: 'user', id: user.userId })),
      ...users.map(user => () => deleteAccountSettings({ kind: 'user', id: user.userId })),
      ...users.map(user => () => deleteRoleAssignmentsFor({ type: 'USER', id: user.userId })),
      ...policies.map(organisationId => () => clearAccessTokenTtl(organisationId)),
      ...teams.map(organisationId => () => deleteOrganisation(organisationId)),
      ...users.map(user => () => deleteIdentityUser(user)),
      () => clearIpState(clientIp),
    ]);
  },
});

export { expect } from '@playwright/test';
