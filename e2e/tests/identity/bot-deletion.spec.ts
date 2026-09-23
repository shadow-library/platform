/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  assignApplicationRole,
  type AuthzApi,
  type BotTransferRow,
  type CatalogManifest,
  createAuthzApi,
  deleteBotTransfers,
  findApplicationIdByName,
  findAuditEvents,
  identityMutate,
  insertBotTransfer,
  invalidateAllGrants,
  issueBotKey,
  MAX_BOT_TRANSFER_ATTEMPTS,
  novelForgeDb,
  type OAuthApplication,
  type OrganisationBot,
  readBotClient,
  readBotKeyRecord,
  readBotTransfers,
  readCatalogRole,
  readOrganisationBot,
  updateBotTransfers,
  updateOrganisationMember,
  WaitTimeoutError,
  waitUntil,
} from '../../lib';
import { expect, type IdentityHarness, type IdentityTeam, teamMember, test } from './fixtures';
import { expectRefused } from './helpers';

/**
 * Defining types
 */

interface OwnershipApplication {
  applicationId: number;
  name: string;
  displayName?: string;
  available: boolean;
  records: { kind: string; count: number }[];
  total: number;
}

interface OwnershipTransfer {
  applicationId: number;
  name: string;
  status: string;
  attempts: number;
  exhausted: boolean;
  nextAttemptAt?: string;
  completedAt?: string;
}

interface OwnershipRecipient {
  userId: string;
  role: string;
  displayName?: string;
  email?: string;
}

interface OwnershipView {
  applications: OwnershipApplication[];
  degraded: boolean;
  transfers: OwnershipTransfer[];
  recipients: OwnershipRecipient[];
}

interface DeletionProgress {
  requestedAt: string;
  transferTo?: { id: string };
  pending: number;
  done: number;
  failed: number;
  stalled: boolean;
  stalledApplications: string[];
}

interface BotDetail {
  status: string;
  activeKeyCount: number;
  deletion?: DeletionProgress;
}

interface ForgeProject {
  id: string;
  ownerKind: string;
  sharedWithOrg: boolean;
}

/** A bot mid-deletion whose handover to Novel Forge lands while a second one can never be delivered. */
interface StalledDeletion {
  bot: OrganisationBot;
  stranded: OAuthApplication;
  novelForgeId: number;
  landed: BotTransferRow;
  strandedRow: BotTransferRow;
}

/**
 * Declaring the constants
 *
 * Deleting an organisation bot is two halves. The first is immediate and local: the handle is confirmed, the recipient is
 * checked, every key is revoked, the backing client is deactivated, the bot goes `DELETING` and one handover is queued per
 * bot-aware application. The second belongs to the worker, which hands the bot's records over application by application
 * and writes the `DELETED` tombstone only once every one of them has confirmed.
 *
 * Novel Forge is the one bot-aware application here, and it is reachable, so both halves are asserted against real
 * delivery. The worker polls every five seconds, so a handover is claimed within a tick or two of being queued — which
 * means a bot's `DELETING` state is only stable while something is holding the deletion open. The tests that assert on
 * that state give the bot a second handover to an application that is no longer bot-aware, a row the worker can claim but
 * never deliver; the rest wait the drain out with `waitUntil` rather than reading a state the server may already have
 * left. An application holds its handovers by `ON DELETE restrict`, so every such row is removed before the harness takes
 * the application down.
 */

/** Six worker ticks: enough for a handover to be claimed, delivered and finalised, and short enough to fail fast. */
const WORKER_TIMEOUT_MS = 30_000;

const MINUTE_MS = 60_000;

/** The one bot-aware application in this environment: it declares `novel-forge:bots:manage` and identity's outbound client holds it. */
const NOVEL_FORGE = 'novel-forge';

/** Novel Forge counts both of its bot-ownable record kinds on every answer, so a bot owning one project reports the other as zero. */
const NO_ILLUSTRATIONS = { kind: 'illustrations', count: 0 };

const GUARDED = 'widgets:read';

/** A throwaway application whose one role is bot-grantable, so a bot's policy decisions are observable through its own caller. */
const GUARDED_MANIFEST: CatalogManifest = {
  permissions: [{ name: GUARDED }],
  roles: [{ name: 'WidgetReader', permissions: [GUARDED], bot: { resource: 'widgets', level: 'read' } }],
};

const botPath = (bot: OrganisationBot): string => `/api/v1/organisations/${bot.organisationId}/bots/${bot.botId}`;

async function ownership(ctx: APIRequestContext, bot: OrganisationBot): Promise<OwnershipView> {
  const response = await ctx.get(`${botPath(bot)}/ownership`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as OwnershipView;
}

async function detail(ctx: APIRequestContext, bot: OrganisationBot): Promise<BotDetail> {
  const response = await ctx.get(botPath(bot));
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as BotDetail;
}

function requestDeletion(ctx: APIRequestContext, bot: OrganisationBot, body: { transferToUserId: string; confirmHandle?: string }): Promise<APIResponse> {
  return identityMutate(ctx, 'delete', botPath(bot), { confirmHandle: bot.handle, ...body });
}

/**
 * Every handover's outcome in one line. A timeout waiting on the worker has two very different causes — the worker is not
 * ticking, or it is ticking and Novel Forge is unreachable (which is what an unset `SERVICE_URL_NOVEL_FORGE_SERVER` looks
 * like) — and only the rows tell them apart.
 */
function describeTransfers(rows: BotTransferRow[], novelForgeId: number): string {
  if (rows.length === 0) return 'no rows at all, so the request queued nothing';
  const name = (applicationId: number): string => (applicationId === novelForgeId ? NOVEL_FORGE : `application ${applicationId}`);
  return rows.map(row => `${name(row.applicationId)}: ${row.status} after ${row.attempts} attempt(s)${row.lastError ? ` — ${row.lastError}` : ''}`).join('; ');
}

/** The one handover naming `applicationId`, whether the rows come from the database or from the ownership view. */
function transferTo<T extends { applicationId: number }>(rows: T[], applicationId: number): T {
  const row = rows.find(item => item.applicationId === applicationId);
  if (!row) throw new Error(`no handover to application ${applicationId} among ${rows.map(item => item.applicationId).join(', ')}`);
  return row;
}

/**
 * A bot holding a grantable role on a throwaway application, and that application's own policy-decision caller. Identity's
 * own bot roles cannot stand in: a decision is scoped to the application the calling client belongs to, and the platform
 * application's clients are the seeded ecosystem ones.
 */
async function decidableBot(identity: IdentityHarness, team: IdentityTeam, label: string): Promise<{ bot: OrganisationBot; authz: AuthzApi }> {
  const application = await identity.createOAuthApp(label);
  const authz = await createAuthzApi((await identity.admin()).ctx, await identity.anonymous(), application);
  await authz.syncOrThrow(GUARDED_MANIFEST);
  await invalidateAllGrants();

  const role = await readCatalogRole(application.applicationId, 'WidgetReader');
  await assignApplicationRole({ type: 'USER', id: team.owner.userId }, role.roleId, team.organisationId);
  const bot = await identity.createBot(team, { label });
  const granted = await identityMutate(team.ownerCtx, 'put', `${botPath(bot)}/permissions`, {
    grants: [{ applicationId: application.applicationId, resource: 'widgets', level: 'read' }],
  });
  expect(granted.status(), await granted.text()).toBe(200);
  return { bot, authz };
}

/** One project owned by the bot at Novel Forge, so the handover has records to actually move. */
async function botProject(forge: APIRequestContext): Promise<ForgeProject> {
  const created = await forge.post('/api/v1/projects', { data: { name: `e2e-handover-${Date.now().toString(36)}`, kind: 'new_novel' } });
  expect(created.status(), await created.text()).toBe(201);
  const project = (await created.json()) as ForgeProject;
  expect(project, 'what a bot creates belongs to the bot and is shared with its organisation').toMatchObject({ ownerKind: 'bot', sharedWithOrg: true });
  return project;
}

/**
 * Requests a deletion that cannot finish: a handover to an application that no longer exposes a bot ownership scope is
 * queued alongside the real one, so the worker claims it, fails it and leaves the bot `DELETING` for as long as the test
 * needs. The row is queued before the request because the enqueue is atomic with it, and `onConflictDoNothing` means the
 * request's own fan-out neither sees nor rewrites it. The row is removed again on any failure here: it holds the
 * application by `ON DELETE restrict`, which the harness takes down before the bot.
 */
async function stalledDeletion(identity: IdentityHarness, team: IdentityTeam, label: string, bot: OrganisationBot): Promise<StalledDeletion> {
  const stranded = await identity.createOAuthApp(label);
  const novelForgeId = await findApplicationIdByName(NOVEL_FORGE);
  await insertBotTransfer(bot.botId, stranded.applicationId, team.owner.userId);
  let seen: BotTransferRow[] = [];
  try {
    expect((await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId })).status()).toBe(202);
    const settled = await waitUntil(
      async () => {
        seen = await readBotTransfers(bot.botId);
        const landed = seen.find(row => row.applicationId === novelForgeId && row.status === 'DONE');
        const strandedRow = seen.find(row => row.applicationId === stranded.applicationId && row.status === 'FAILED');
        return landed && strandedRow ? { landed, strandedRow } : undefined;
      },
      { timeoutMs: WORKER_TIMEOUT_MS, message: 'the worker never settled both handovers' },
    );
    return { bot, stranded, novelForgeId, ...settled };
  } catch (error) {
    await deleteBotTransfers(bot.botId, stranded.applicationId);
    if (error instanceof WaitTimeoutError) throw new WaitTimeoutError(`${error.message}. Handovers stood at ${describeTransfers(seen, novelForgeId)}`);
    throw error;
  }
}

test.describe('identity bot deletion — what an administrator is shown and refused', () => {
  test('should count what the bot owns at every bot-aware application and offer only the members eligible to inherit it', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botdel-view' });
    const bot = await identity.createBot(team, { label: 'botdel-view' });
    const novelForgeId = await findApplicationIdByName(NOVEL_FORGE);
    await identityMutate(team.ownerCtx, 'put', `${botPath(bot)}/permissions`, { grants: [{ applicationId: novelForgeId, resource: 'projects', level: 'write' }] });
    const forge = await identity.botCaller((await issueBotKey(team.ownerCtx, bot)).key, { product: 'novelForge' });
    const member = await teamMember(identity, team, 'botdel-view-m', 'MEMBER');
    const suspended = await teamMember(identity, team, 'botdel-view-s', 'MEMBER');
    await updateOrganisationMember(team.organisationId, suspended.user.userId, { status: 'SUSPENDED' });
    const closed = await identity.createUser({ label: 'botdel-view-c', status: 'CLOSED' });
    await addOrganisationMember(team.organisationId, closed.userId, { role: 'MEMBER' });
    const neighbour = await identity.createTeam({ label: 'botdel-view-other' });

    const project = await botProject(forge);
    try {
      const unelevated = (await identity.signIn(team.owner)).ctx;
      const view = await ownership(unelevated, bot);
      expect(
        view.applications.map(item => item.name),
        'every application that can own records for a bot is listed',
      ).toEqual([NOVEL_FORGE]);
      expect(view.applications[0], 'with the counts it reports for each of its own record kinds').toMatchObject({
        applicationId: novelForgeId,
        displayName: 'Novel Forge',
        available: true,
        records: [{ kind: 'projects', count: 1 }, NO_ILLUSTRATIONS],
        total: 1,
      });
      expect(view.degraded, 'nothing is missing from the counts').toBe(false);
      expect(view.transfers, 'and nothing is queued before a deletion is asked for').toEqual([]);
      expect(
        view.recipients.map(item => ({ userId: item.userId, role: item.role, email: item.email })),
        'a suspended member, a closed account and another organisation’s owner are all ineligible',
      ).toEqual([
        { userId: team.owner.userId, role: 'OWNER', email: team.owner.email },
        { userId: member.user.userId, role: 'MEMBER', email: member.user.email },
      ]);
      expect(
        view.recipients.map(item => item.userId),
        'so the picker never offers one the deletion would refuse',
      ).not.toContain(neighbour.owner.userId);

      await expectRefused(await member.ctx.get(`${botPath(bot)}/ownership`), 403, 'ORG_007', 'a plain member reading the handover view');
    } finally {
      await novelForgeDb()`DELETE FROM projects WHERE id = ${project.id}`;
    }
  });

  test('should refuse a recipient who is not an active member, or a handle that does not match, and change nothing', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botdel-refuse' });
    const bot = await identity.createBot(team, { label: 'botdel-refuse' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const outsider = await identity.createUser({ label: 'botdel-refuse-out' });
    const neighbour = await identity.createTeam({ label: 'botdel-refuse-other' });
    const suspended = await teamMember(identity, team, 'botdel-refuse-s', 'MEMBER');
    await updateOrganisationMember(team.organisationId, suspended.user.userId, { status: 'SUSPENDED' });
    const closed = await identity.createUser({ label: 'botdel-refuse-c', status: 'CLOSED' });
    await addOrganisationMember(team.organisationId, closed.userId, { role: 'MEMBER' });

    for (const [label, transferToUserId] of [
      ['a user of no organisation', outsider.userId],
      ["another organisation's owner", neighbour.owner.userId],
      ['a suspended member', suspended.user.userId],
      ['a closed account that still holds an active membership', closed.userId],
    ] as const) {
      await expectRefused(await requestDeletion(team.ownerCtx, bot, { transferToUserId }), 400, 'BOT_008', label);
    }

    const mismatched = await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId, confirmHandle: `${bot.handle}x` });
    expect(mismatched.status(), await mismatched.text()).toBe(422);
    expect(((await mismatched.json()) as { fields?: { field: string }[] }).fields?.map(item => item.field)).toEqual(['confirmHandle']);

    expect(await readOrganisationBot(bot.botId), 'no refused deletion moved the bot').toMatchObject({ status: 'ACTIVE' });
    expect((await readBotKeyRecord(key.keyId))?.revokedAt, 'nor revoked its key').toBeNull();
    expect(await readBotTransfers(bot.botId), 'nor queued a handover').toEqual([]);

    const accepted = await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId });
    expect(accepted.status(), 'the same call with an eligible recipient and the right handle is accepted').toBe(202);
    expect((await readBotKeyRecord(key.keyId))?.revokedAt, 'and revokes the key it left alone before').toBeInstanceOf(Date);
  });
});

test.describe('identity bot deletion — the handover', () => {
  test('should queue one handover per bot-aware application, revoke every key and stop the bot at once', async ({ identity }) => {
    test.setTimeout(90_000);
    const team = await identity.createTeam({ label: 'botdel-request' });
    const { bot, authz } = await decidableBot(identity, team, 'botdel-request');
    const key = await issueBotKey(team.ownerCtx, bot);
    const botCtx = await identity.botCaller(key.key);
    const decision = { principalType: 'SERVICE_ACCOUNT' as const, principalId: bot.clientId, organisationId: team.organisationId, action: GUARDED };
    expect(await authz.decide(decision), 'the bot passes policy decisions before the deletion').toMatchObject({ decision: 'PERMIT' });

    const { stranded, novelForgeId, landed } = await stalledDeletion(identity, team, 'botdel-request-stranded', bot);
    try {
      expect(await readOrganisationBot(bot.botId), 'one application that cannot confirm keeps the bot deleting').toMatchObject({ status: 'DELETING', deletedAt: null });
      expect((await detail(team.ownerCtx, bot)).activeKeyCount, 'every key is revoked with the request').toBe(0);
      expect((await readBotClient(bot.clientId))?.isActive, 'and the backing client is deactivated').toBe(false);
      expect(landed, 'the handover to the one bot-aware application is delivered and recorded').toMatchObject({ status: 'DONE', toUserId: team.owner.userId });
      expect((await detail(team.ownerCtx, bot)).deletion, 'the detail names the member the records are going to').toMatchObject({
        done: 1,
        failed: 1,
        pending: 0,
        transferTo: { id: team.owner.userId },
      });
      expect(
        (await ownership(team.ownerCtx, bot)).transfers.map(item => item.applicationId),
        'both handovers are reported',
      ).toEqual(expect.arrayContaining([novelForgeId, stranded.applicationId]));

      const audited = await findAuditEvents('bot.deletion.requested', bot.botId);
      expect(audited, 'the request is audited once, by the administrator who made it').toHaveLength(1);
      expect(audited[0]).toMatchObject({
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorId: team.owner.userId,
        organisationId: team.organisationId,
        targetType: 'bot',
        detail: { handle: bot.handle, transferToUserId: team.owner.userId, revokedKeys: 1, applications: [NOVEL_FORGE] },
      });

      expect(await authz.decide(decision), 'the bot stops passing policy decisions immediately').toMatchObject({ decision: 'DENY', reasons: ['the bot is not active'] });
      await expectRefused(await botCtx.get(`/api/v1/organisations/${team.organisationId}/members`), 401, 'AUTH_005', 'the key it held until the deletion');
      await expectRefused(
        await identityMutate(team.ownerCtx, 'post', `${botPath(bot)}/keys`, { name: 'e2e-after', expiresAt: new Date(Date.now() + 60 * MINUTE_MS).toISOString() }),
        409,
        'BOT_010',
        'a new key for a deleting bot',
      );
      await expectRefused(await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId }), 409, 'BOT_010', 'a second deletion request');
      expect(await findAuditEvents('bot.deleted', bot.botId), 'and nothing is finished while a handover is outstanding').toEqual([]);
    } finally {
      await deleteBotTransfers(bot.botId, stranded.applicationId);
    }
  });

  test('should drain a delivered handover to DELETED, hand the records to the chosen member and audit both steps', async ({ identity }) => {
    test.setTimeout(90_000);
    const team = await identity.createTeam({ label: 'botdel-drain' });
    const recipient = await teamMember(identity, team, 'botdel-drain-r', 'MEMBER');
    const bot = await identity.createBot(team, { label: 'botdel-drain' });
    const novelForgeId = await findApplicationIdByName(NOVEL_FORGE);
    await identityMutate(team.ownerCtx, 'put', `${botPath(bot)}/permissions`, { grants: [{ applicationId: novelForgeId, resource: 'projects', level: 'write' }] });
    const forge = await identity.botCaller((await issueBotKey(team.ownerCtx, bot)).key, { product: 'novelForge' });
    const project = await botProject(forge);

    try {
      expect((await requestDeletion(team.ownerCtx, bot, { transferToUserId: recipient.user.userId })).status()).toBe(202);
      expect(
        (await readBotTransfers(bot.botId)).map(row => ({ applicationId: row.applicationId, toUserId: row.toUserId })),
        'one handover is queued, for the one bot-aware application, to the chosen member',
      ).toEqual([{ applicationId: novelForgeId, toUserId: recipient.user.userId }]);

      const tombstone = await waitUntil(
        async () => {
          const row = await readOrganisationBot(bot.botId);
          return row?.status === 'DELETED' ? row : undefined;
        },
        { timeoutMs: WORKER_TIMEOUT_MS, message: 'the bot never reached DELETED' },
      );
      expect(tombstone.deletedAt, 'the worker stamps the tombstone once every application has confirmed').toBeInstanceOf(Date);
      expect(await readBotTransfers(bot.botId), 'the delivered handover is recorded as done on its first attempt').toEqual([
        expect.objectContaining({ applicationId: novelForgeId, status: 'DONE', attempts: 1, lastError: null, completedAt: expect.any(Date) }),
      ]);

      const transferred = await findAuditEvents('bot.ownership.transferred', bot.botId);
      expect(transferred, 'the handover is audited by the worker, naming what moved').toHaveLength(1);
      expect(transferred[0]).toMatchObject({
        outcome: 'SUCCESS',
        actorType: 'SYSTEM',
        actorId: null,
        organisationId: team.organisationId,
        targetType: 'bot',
        detail: { application: NOVEL_FORGE, toUserId: recipient.user.userId, attempts: 1, moved: { projects: 1, illustrations: 0 } },
      });
      const tombstoned = await findAuditEvents('bot.deleted', bot.botId);
      expect(tombstoned, 'and the completion after it').toHaveLength(1);
      expect(tombstoned[0]).toMatchObject({ actorType: 'SYSTEM', actorId: null, detail: { handle: bot.handle, clientId: bot.clientId } });

      expect(
        await novelForgeDb()<{ ownerKind: string; ownerId: string; sharedWithOrg: boolean }[]>`
          SELECT owner_kind AS "ownerKind", owner_id::text AS "ownerId", shared_with_org AS "sharedWithOrg" FROM projects WHERE id = ${project.id}
        `,
        'the records the bot owned belong to that member, and the organisation keeps the access it had',
      ).toEqual([{ ownerKind: 'user', ownerId: recipient.user.userId, sharedWithOrg: true }]);

      const listing = await team.ownerCtx.get(`/api/v1/organisations/${team.organisationId}/bots`);
      expect(
        ((await listing.json()) as { bots: { id: string }[] }).bots.map(item => item.id),
        'a deleted bot leaves the listing',
      ).not.toContain(bot.botId);
      await expectRefused(await team.ownerCtx.get(botPath(bot)), 404, 'BOT_009', 'the detail of a deleted bot');
      await expectRefused(await identityMutate(team.ownerCtx, 'post', `${botPath(bot)}/ownership/retry`), 404, 'BOT_009', 'a retry for a deleted bot');
    } finally {
      await novelForgeDb()`DELETE FROM projects WHERE id = ${project.id}`;
    }
  });

  test('should requeue only the handovers that ran out of attempts and leave a delivered one alone', async ({ identity }) => {
    test.setTimeout(90_000);
    const team = await identity.createTeam({ label: 'botdel-retry' });
    const bot = await identity.createBot(team, { label: 'botdel-retry' });
    const { stranded, novelForgeId, landed, strandedRow } = await stalledDeletion(identity, team, 'botdel-retry-stranded', bot);

    try {
      expect(strandedRow, 'a handover no application will answer records why it could not be delivered').toMatchObject({
        attempts: 1,
        lastError: 'application no longer exposes a bot ownership scope',
      });
      expect(strandedRow.nextAttemptAt.getTime(), 'the next attempt waits out the first step of the backoff').toBeGreaterThan(Date.now() + MINUTE_MS);
      expect((await detail(team.ownerCtx, bot)).deletion, 'a handover still inside its budget does not stall the deletion').toMatchObject({ failed: 1, stalled: false });

      await updateBotTransfers(bot.botId, { attempts: MAX_BOT_TRANSFER_ATTEMPTS }, stranded.applicationId);
      expect((await detail(team.ownerCtx, bot)).deletion, 'one out of attempts stalls it and names the application').toMatchObject({
        failed: 1,
        stalled: true,
        stalledApplications: [stranded.name],
      });
      expect(transferTo((await ownership(team.ownerCtx, bot)).transfers, stranded.applicationId)).toMatchObject({ status: 'FAILED', exhausted: true });
      expect(transferTo((await ownership(team.ownerCtx, bot)).transfers, novelForgeId), 'a delivered handover is never exhausted').toMatchObject({
        status: 'DONE',
        exhausted: false,
      });

      const retried = await identityMutate(team.ownerCtx, 'post', `${botPath(bot)}/ownership/retry`);
      expect(retried.status(), await retried.text()).toBe(200);
      expect(await retried.json(), 'only the exhausted handover is handed back').toEqual({ retried: 1 });
      expect(transferTo(await readBotTransfers(bot.botId), stranded.applicationId), 'requeued with a clean attempt budget').toMatchObject({
        status: 'PENDING',
        attempts: 0,
        lastError: null,
      });
      expect(transferTo(await readBotTransfers(bot.botId), novelForgeId), 'while the delivered one keeps its result and is never re-applied').toEqual(landed);
      expect(await findAuditEvents('bot.ownership.transferred', bot.botId), 'so the records move exactly once').toHaveLength(1);
      expect(
        (await findAuditEvents('bot.deletion.requested', bot.botId)).map(row => row.detail?.retriedTransfers),
        'and the retry is audited alongside the request',
      ).toEqual([undefined, 1]);

      const nothingToRetry = await identityMutate(team.ownerCtx, 'post', `${botPath(bot)}/ownership/retry`);
      expect(await nothingToRetry.json(), 'a retry with nothing out of attempts requeues nothing').toEqual({ retried: 0 });

      const live = await identity.createBot(team, { label: 'botdel-retry-live' });
      await expectRefused(
        await identityMutate(team.ownerCtx, 'post', `${botPath(live)}/ownership/retry`),
        409,
        'BOT_010',
        'retrying handovers for a bot that is not being deleted',
      );
    } finally {
      await deleteBotTransfers(bot.botId, stranded.applicationId);
    }
  });

  test('should refuse to delete an application while a handover to it is still in flight', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botdel-app' });
    const bot = await identity.createBot(team, { label: 'botdel-app' });
    const application = await identity.createOAuthApp('botdel-app');
    const admin = (await identity.admin()).ctx;
    await insertBotTransfer(bot.botId, application.applicationId, team.owner.userId);

    await expectRefused(
      await identityMutate(admin, 'delete', `/api/v1/admin/applications/${application.applicationId}`),
      409,
      'APP_014',
      'an application a bot is still handing records to',
    );

    await deleteBotTransfers(bot.botId);
    expect((await identityMutate(admin, 'delete', `/api/v1/admin/applications/${application.applicationId}`)).status(), 'once nothing is in flight it deletes').toBe(200);
  });
});
