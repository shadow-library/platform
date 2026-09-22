/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse, type BrowserContext, expect, request, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  apiContext,
  createIdentitySession,
  identityDb,
  type IdentitySession,
  identitySessionContext,
  novelForgeDb,
  PERSONAS,
  pollUntil,
  readSeedManifest,
  requireProductUrl,
} from '../../lib';
import { organisationBoundContext, scopedMutate } from './helpers';

/**
 * Defining types
 */

interface CatalogLevel {
  readonly roleId: number;
  readonly level: 'read' | 'write';
  readonly sensitive: boolean;
  readonly eligible: boolean;
  readonly heldByYou: boolean;
}

interface CatalogApplication {
  readonly applicationId: number;
  readonly name: string;
  readonly resources: { readonly resource: string; readonly levels: CatalogLevel[] }[];
}

interface BotItem {
  readonly id: string;
  readonly clientId: string;
  readonly handle: string;
  readonly status: string;
}

interface CreatedBotKey {
  readonly id: string;
  readonly keyPrefix: string;
  readonly status: string;
  readonly key: string;
}

interface BotGrantItem {
  readonly roleName: string;
  readonly application: string;
  readonly resource?: string;
  readonly level?: string;
  readonly granterHoldsPermission: boolean;
  readonly managed: boolean;
}

interface BotActivityItem {
  readonly action: string;
  readonly outcome: string;
  readonly keyId?: string;
}

interface ProjectItem {
  readonly id: string;
  readonly name: string;
  readonly ownerKind: 'user' | 'bot';
  readonly sharedWithOrg: boolean;
}

/**
 * Declaring the constants
 *
 * The organisation-bot story, end to end across identity and Novel Forge: an org admin creates a bot, grants it
 * Novel Forge projects from the permission catalog and issues one key; the bot authenticates with nothing but
 * `Authorization: Bearer sl_bot_…` and lands a project that comes back bot-owned and shared with the
 * organisation; an organisation curator reaches that project while a member without `novel-forge:curate` cannot
 * tell it from one that does not exist; the bot is refused on a route needing a grant it never received; the key
 * is revoked and the bot stops; the activity feed accounts for the key's whole life; and the bot is finally
 * deleted by handing its project to a member.
 *
 * Serial, because every step is built by the one above it. The organisation is created per run (timestamped
 * slug) so nothing collides and the bot limit never accumulates, mirroring `org-access-and-visibility.spec.ts`.
 *
 * Two setup steps are deliberately not driven through their own product flows, which other specs already cover:
 * the member joins by an `organisation_members` row rather than the invitation round-trip, and the curator's
 * `novel-forge:curate` comes from identity's admin role-assignment API, which is the only surface that grants an
 * application role to a person. The seeded admin holds platform `iam:roles:manage`, so that assignment takes
 * `assertAssignable`'s `scope !== 'application'` early return and never exercises the entitlement or membership
 * checks — it proves the assignment landed, not that the organisation is entitled, which the catalog asserts.
 */

/** Identity's application name for Novel Forge — the key the bot permission catalog is indexed by. */
const NOVEL_FORGE_APPLICATION = 'novel-forge';

/** The catalog resource each Novel Forge role is claimed under; `curated-ingest` write is the `novel-forge:curate` role. */
const PROJECTS_RESOURCE = 'projects';
const CURATE_RESOURCE = 'curated-ingest';

/** A bot key is exchanged for a short-lived token the SDK caches for at most 60s, so a revocation lands within that window. */
const REVOCATION_WINDOW_MS = 90_000;

/** The ownership transfer is driven by identity's worker, so the new owner appears asynchronously. */
const TRANSFER_TIMEOUT_MS = 90_000;

/** The issued key outlives only this run: teardown revokes it, and an hour caps the damage if teardown itself fails. */
const KEY_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Elevates `ctx`'s identity session to AAL2, which every bot mutation is gated behind. The seeded personas
 * enrol no second factor, so identity accepts the account password as the step-up proof.
 */
async function stepUp(ctx: APIRequestContext, identityUrl: string, password: string): Promise<void> {
  const response = await scopedMutate(ctx, identityUrl, 'post', '/api/v1/me/mfa/step-up', { data: { password }, seedPath: '/api/v1/me' });
  expect(response.status(), `step-up should succeed — body ${await response.text()}`).toBe(200);
  expect(((await response.json()) as { aal: string }).aal, 'a completed step-up leaves the session at AAL2').toBe('AAL2');
}

/** The project ids a list response carries. */
async function projectIds(response: APIResponse): Promise<string[]> {
  expect(response.status(), `listing projects — body ${await response.text()}`).toBe(200);
  return ((await response.json()) as { items: ProjectItem[] }).items.map(item => item.id);
}

test.describe.configure({ mode: 'serial' });

test.describe('organisation bots across identity and Novel Forge', () => {
  const identityUrl = requireProductUrl('identity');
  const novelForgeUrl = requireProductUrl('novelForge');
  const { users } = readSeedManifest();

  const stamp = Date.now();
  const orgSlug = `e2e-bots-${stamp}`;
  const botHandle = `e2e-release-notes-${stamp.toString(36)}`;
  const projectName = `e2e-bot-project-${stamp}`;

  // Shared, built up across the serial steps.
  let ownerIdentity: APIRequestContext;
  let adminSession: IdentitySession;
  let adminIdentity: APIRequestContext;
  let botContext: APIRequestContext;
  let curatorContext: BrowserContext;
  let memberContext: BrowserContext;
  let organisationId: string;
  let applicationId: number;
  let botId: string;
  let keyId: string;
  let projectId: string;

  test.beforeAll(async () => {
    ownerIdentity = await apiContext('identity', 'user1');
    // An already-elevated admin session, arranged in the database: the dev bootstrap admin has a passkey enrolled, so identity
    // refuses a password step-up for it (MFA_001), and step-up is not what this spec is about.
    adminSession = await createIdentitySession(users.admin.userId, { aal: 'AAL2' });
    adminIdentity = await identitySessionContext(adminSession);
  });

  test.afterAll(async () => {
    // Revoking is unconditional and goes through the database, not the API: serial mode skips the remaining tests
    // when one fails but still runs this, and the API route is elevated — a failed step-up would be exactly the
    // case that leaves a live `sl_bot_…` credential behind in a shared environment. The project is the only other
    // row this spec leaves there, and it outlives the bot that made it: the seed's novel-forge sweep only reaches
    // user-owned projects. The organisation, its membership, the keyless bot and the curator role assignment
    // persist, as in `org-access-and-visibility.spec.ts` — identity offers no cheap delete, and every one of them
    // is scoped to a slug unique to this run.
    //
    // Settled independently so that one failure — a database that went away mid-run, say — cannot strand the
    // revoke or the disposals, and reported rather than swallowed, since a revoke that silently failed is the
    // whole risk this teardown exists to close.
    const settled = await Promise.allSettled([
      botId ? identityDb()`UPDATE bot_keys SET revoked_at = now() WHERE bot_id = ${botId} AND revoked_at IS NULL` : undefined,
      adminSession ? identityDb()`UPDATE user_sessions SET status = 'REVOKED', terminated_at = now() WHERE id = ${adminSession.sessionId}` : undefined,
      projectId ? novelForgeDb()`DELETE FROM projects WHERE id = ${projectId}` : undefined,
      botContext?.dispose(),
      curatorContext?.close(),
      memberContext?.close(),
      ownerIdentity?.dispose(),
      adminIdentity?.dispose(),
    ]);

    const failures = settled.flatMap(result => (result.status === 'rejected' ? [String(result.reason)] : []));
    expect(failures, 'every teardown step should settle cleanly').toEqual([]);
  });

  test('should stand up a team organisation with an owner, a curator and a plain member', async () => {
    const created = await scopedMutate(ownerIdentity, identityUrl, 'post', '/api/v1/organisations', {
      data: { name: 'E2E Bot Workshop', slug: orgSlug },
      seedPath: '/api/v1/me',
    });
    expect(created.status(), `create organisation — body ${await created.text()}`).toBe(201);
    const organisation = (await created.json()) as { id: string; type: string };
    expect(organisation.type, 'bots are available to TEAM organisations only').toBe('TEAM');
    organisationId = organisation.id;

    await identityDb()`
      INSERT INTO organisation_members (organisation_id, user_id, role)
      VALUES (${organisationId}, ${users.user2.userId}, 'MEMBER')
      ON CONFLICT (organisation_id, user_id) DO NOTHING
    `;

    const members = await ownerIdentity.get(`/api/v1/organisations/${organisationId}/members`);
    expect(members.status(), `list members — body ${await members.text()}`).toBe(200);
    const memberIds = ((await members.json()) as { members: { userId: string }[] }).members.map(member => member.userId);
    expect(memberIds, 'the owner and the plain member both belong to the organisation').toEqual(expect.arrayContaining([users.user1.userId, users.user2.userId]));
  });

  test('should catalog the grants this organisation may give a bot and make the owner a curator', async () => {
    const catalog = await ownerIdentity.get(`/api/v1/organisations/${organisationId}/bot-permission-catalog`);
    expect(catalog.status(), `bot permission catalog — body ${await catalog.text()}`).toBe(200);
    const applications = ((await catalog.json()) as { applications: CatalogApplication[] }).applications;
    const novelForge = applications.find(application => application.name === NOVEL_FORGE_APPLICATION);
    expect(novelForge, 'the organisation reaches Novel Forge, which declares bot-grantable roles').toBeTruthy();
    applicationId = novelForge!.applicationId;

    const projects = novelForge!.resources.find(resource => resource.resource === PROJECTS_RESOURCE);
    expect(
      projects?.levels.map(level => level.level),
      'projects are catalogued read before write',
    ).toEqual(['read', 'write']);
    const write = projects!.levels.find(level => level.level === 'write');
    expect(write?.eligible, 'the projects writer role is bot-grantable here').toBe(true);
    expect(write?.heldByYou, 'the granting admin holds what it is about to grant — the ceiling a grant is checked against').toBe(true);

    const curate = novelForge!.resources.find(resource => resource.resource === CURATE_RESOURCE)?.levels.find(level => level.level === 'write');
    expect(curate, 'the curate role is catalogued under curated-ingest').toBeTruthy();

    // `novel-forge:curate` is not part of the default authoring role, and no self-service surface grants an
    // application role to a person — identity's platform admin is the only one who can make the owner a curator.
    const assigned = await scopedMutate(adminIdentity, identityUrl, 'post', '/api/v1/admin/role-assignments', {
      data: { principalType: 'USER', principalId: users.user1.userId, roleId: curate!.roleId, organisationId },
      seedPath: '/api/v1/me',
    });
    expect(assigned.status(), `assign the curator role — body ${await assigned.text()}`).toBe(200);
  });

  test('should create a bot, grant it Novel Forge projects, and hand back its key exactly once', async () => {
    test.setTimeout(60_000);
    await stepUp(ownerIdentity, identityUrl, PERSONAS.user1.password);

    const created = await scopedMutate(ownerIdentity, identityUrl, 'post', `/api/v1/organisations/${organisationId}/bots`, {
      data: { handle: botHandle, displayName: 'E2E Release Notes' },
      seedPath: '/api/v1/me',
    });
    expect(created.status(), `create bot — body ${await created.text()}`).toBe(201);
    const bot = (await created.json()) as BotItem;
    expect(bot.handle).toBe(botHandle);
    expect(bot.status).toBe('ACTIVE');
    expect(bot.clientId, 'the bot is backed by its own OAuth client').toMatch(/^bot_/);
    botId = bot.id;

    // One entry per resource: the write level carries the read role's permissions, so this is projects read+write.
    const granted = await scopedMutate(ownerIdentity, identityUrl, 'put', `/api/v1/organisations/${organisationId}/bots/${botId}/permissions`, {
      data: { grants: [{ applicationId, resource: PROJECTS_RESOURCE, level: 'write' }] },
      seedPath: '/api/v1/me',
    });
    expect(granted.status(), `grant projects write — body ${await granted.text()}`).toBe(200);

    const permissions = await ownerIdentity.get(`/api/v1/organisations/${organisationId}/bots/${botId}/permissions`);
    expect(permissions.status()).toBe(200);
    const grants = ((await permissions.json()) as { grants: BotGrantItem[] }).grants;
    expect(grants.map(grant => `${grant.application}:${grant.resource}:${grant.level}`)).toEqual([`${NOVEL_FORGE_APPLICATION}:${PROJECTS_RESOURCE}:write`]);
    expect(grants[0]?.granterHoldsPermission, 'the granting admin still holds the permission behind the grant').toBe(true);
    expect(grants[0]?.managed, 'a grant written here can be changed here').toBe(true);

    const expiresAt = new Date(Date.now() + KEY_LIFETIME_MS).toISOString();
    const issued = await scopedMutate(ownerIdentity, identityUrl, 'post', `/api/v1/organisations/${organisationId}/bots/${botId}/keys`, {
      data: { name: 'e2e-runner', expiresAt },
      seedPath: '/api/v1/me',
    });
    expect(issued.status(), `create bot key — body ${await issued.text()}`).toBe(201);
    const key = (await issued.json()) as CreatedBotKey;
    expect(key.key, 'a bot key is presented as an sl_bot_ secret').toMatch(/^sl_bot_/);
    expect(key.status).toBe('ACTIVE');
    keyId = key.id;

    const keys = await ownerIdentity.get(`/api/v1/organisations/${organisationId}/bots/${botId}/keys`);
    expect(await keys.text(), 'the secret is returned once; the key list carries only its prefix').not.toContain(key.key);

    botContext = await request.newContext({ baseURL: novelForgeUrl, ignoreHTTPSErrors: true, extraHTTPHeaders: { authorization: `Bearer ${key.key}` } });
  });

  test('should let the bot create a Novel Forge project that is bot-owned and shared with the organisation', async () => {
    const created = await botContext.post('/api/v1/projects', { data: { name: projectName, kind: 'new_novel' } });
    expect(created.status(), `bot creates a project — body ${await created.text()}`).toBe(201);
    const project = (await created.json()) as ProjectItem;
    expect(project.ownerKind, 'the project belongs to the bot, not to the admin who made it').toBe('bot');
    expect(project.sharedWithOrg, 'a bot shares what it creates with its organisation, or nobody could reach it').toBe(true);
    projectId = project.id;

    expect(await projectIds(await botContext.get('/api/v1/projects?limit=100')), 'the bot lists the project it owns').toContain(projectId);
  });

  test('should show the shared project to an organisation curator and hide it from a member without curate', async ({ browser }) => {
    test.setTimeout(90_000);
    curatorContext = await organisationBoundContext(browser, 'user1', novelForgeUrl, organisationId);
    memberContext = await organisationBoundContext(browser, 'user2', novelForgeUrl, organisationId);

    const curatorRead = await curatorContext.request.get(`${novelForgeUrl}/api/v1/projects/${projectId}`);
    expect(curatorRead.status(), `a curator opens the shared project — body ${await curatorRead.text()}`).toBe(200);
    expect(((await curatorRead.json()) as ProjectItem).ownerKind, 'the curator reads it without owning it').toBe('bot');
    expect(await projectIds(await curatorContext.request.get(`${novelForgeUrl}/api/v1/projects?limit=100`)), "the curator's list carries the bot's project").toContain(projectId);

    const memberRead = await memberContext.request.get(`${novelForgeUrl}/api/v1/projects/${projectId}`);
    expect(memberRead.status(), 'a member without curate must not reach it').toBe(404);
    expect(((await memberRead.json()) as { code?: string }).code, 'the denial is indistinguishable from a project that does not exist').toBe('PRJ_001');
    expect(await projectIds(await memberContext.request.get(`${novelForgeUrl}/api/v1/projects?limit=100`)), "the member's list never carries it").not.toContain(projectId);
  });

  test('should refuse the bot on a route needing a grant it was never given', async () => {
    // Generation is the sensitive `novel-forge:generation:run` grant, which this bot does not hold; the guard
    // answers before the body is ever validated, so an empty one still proves the permission decision.
    const denied = await botContext.post(`/api/v1/projects/${projectId}/generate`, { data: {} });
    expect(denied.status(), `generation without the grant — body ${await denied.text()}`).toBe(403);
    expect(((await denied.json()) as { code?: string }).code, 'the refusal is an authorization denial, not a server error').toBe('IAM_002');
  });

  test('should stop the bot within the revocation window once its key is revoked', async () => {
    test.setTimeout(REVOCATION_WINDOW_MS + 60_000);
    await stepUp(ownerIdentity, identityUrl, PERSONAS.user1.password);

    const revoked = await scopedMutate(ownerIdentity, identityUrl, 'delete', `/api/v1/organisations/${organisationId}/bots/${botId}/keys/${keyId}`, { seedPath: '/api/v1/me' });
    expect(revoked.status(), `revoke bot key — body ${await revoked.text()}`).toBe(200);

    // Novel Forge holds the token it exchanged the key for until it expires, so the bot keeps working for up to
    // 60s after the revocation. Poll rather than assert instantly: the contract is the window, not immediacy.
    const status = await pollUntil(
      async () => (await botContext.get('/api/v1/projects?limit=1')).status(),
      value => value === 401,
      { timeoutMs: REVOCATION_WINDOW_MS, intervalMs: 5_000 },
    );
    expect(status, 'the revoked key must stop authenticating within the exchange-cache window').toBe(401);
  });

  test("should account for the key's creation, use and revocation on the bot activity feed", async () => {
    const activity = await ownerIdentity.get(`/api/v1/organisations/${organisationId}/bots/${botId}/activity?limit=100`);
    expect(activity.status(), `bot activity — body ${await activity.text()}`).toBe(200);
    const events = ((await activity.json()) as { events: BotActivityItem[] }).events;
    const actions = events.map(event => event.action);

    expect(actions, 'the whole life of the key is on the feed').toEqual(expect.arrayContaining(['bot.created', 'bot.key.created', 'bot.key.used', 'bot.key.revoked']));
    expect(
      events.filter(event => event.action.startsWith('bot.key.')).every(event => event.keyId === keyId),
      'every key event names the one key this bot was issued',
    ).toBe(true);
  });

  test('should delete the bot by handing its project to a member, which stays shared with the organisation', async () => {
    test.setTimeout(TRANSFER_TIMEOUT_MS + 60_000);
    await stepUp(ownerIdentity, identityUrl, PERSONAS.user1.password);

    const deleted = await scopedMutate(ownerIdentity, identityUrl, 'delete', `/api/v1/organisations/${organisationId}/bots/${botId}`, {
      data: { transferToUserId: users.user1.userId, confirmHandle: botHandle },
      seedPath: '/api/v1/me',
    });
    expect(deleted.status(), `delete bot — body ${await deleted.text()}`).toBe(202);

    const settled = await pollUntil(
      async () => {
        const response = await curatorContext.request.get(`${novelForgeUrl}/api/v1/projects/${projectId}`);
        return { body: await response.text(), project: (await response.json()) as Partial<ProjectItem> };
      },
      value => value.project.ownerKind === 'user',
      { timeoutMs: TRANSFER_TIMEOUT_MS, intervalMs: 5_000 },
    );
    expect(settled.project.ownerKind, `the records the bot owned end up with the member they were handed to — body ${settled.body}`).toBe('user');
    expect(settled.project.sharedWithOrg, 'the handover keeps the organisation the access it had while the bot existed').toBe(true);
  });
});
