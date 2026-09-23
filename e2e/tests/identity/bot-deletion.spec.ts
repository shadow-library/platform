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
  type CatalogManifest,
  createAuthzApi,
  deleteBotTransfers,
  findAuditEvents,
  identityMutate,
  insertBotTransfer,
  invalidateAllGrants,
  issueBotKey,
  MAX_BOT_TRANSFER_ATTEMPTS,
  type OrganisationBot,
  readBotClient,
  readBotTransfers,
  readCatalogRole,
  readOrganisationBot,
  updateBotTransfers,
  updateOrganisationMember,
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

/**
 * Declaring the constants
 *
 * Deleting an organisation bot is two halves. The first is immediate and local: the handle is confirmed, the recipient is
 * checked, every key is revoked, the backing client is deactivated, the bot goes `DELETING` and one handover is queued per
 * bot-aware application. The second belongs to the worker, which hands the bot's records to that recipient application by
 * application and only then writes the `DELETED` tombstone.
 *
 * In this environment the second half cannot land: identity addresses a bot-aware application as `svc://<name>-server`,
 * and the only bot-aware application here (Novel Forge) runs in another namespace that name does not resolve in. Every
 * handover therefore fails, which is what makes the retry ladder observable and the drain to `DELETED` unobservable —
 * the latter is reported as blocked rather than asserted. For the same reason the ownership fan-out answers
 * `available:false`, so the record counts an application reports are not assertable here either.
 */

/** The worker polls every five seconds; a queued handover is claimed, attempted and marked within a couple of ticks. */
const WORKER_TIMEOUT_MS = 30_000;

const MINUTE_MS = 60_000;

/** Identity's own application, the only bot-aware one in this environment. */
const NOVEL_FORGE = 'novel-forge';

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

test.describe('identity bot deletion — what an administrator is shown and refused', () => {
  test('should report every bot-aware application and only the members eligible to inherit from the bot', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botdel-view' });
    const bot = await identity.createBot(team, { label: 'botdel-view' });
    const member = await teamMember(identity, team, 'botdel-view-m', 'MEMBER');
    const suspended = await teamMember(identity, team, 'botdel-view-s', 'MEMBER');
    await updateOrganisationMember(team.organisationId, suspended.user.userId, { status: 'SUSPENDED' });
    const closed = await identity.createUser({ label: 'botdel-view-c', status: 'CLOSED' });
    await addOrganisationMember(team.organisationId, closed.userId, { role: 'MEMBER' });
    const neighbour = await identity.createTeam({ label: 'botdel-view-other' });

    const unelevated = (await identity.signIn(team.owner)).ctx;
    const view = await ownership(unelevated, bot);
    expect(
      view.applications.map(item => item.name),
      'every application that can own records for a bot is listed',
    ).toEqual([NOVEL_FORGE]);
    expect(view.applications[0], 'an application identity cannot reach reports unknown counts rather than zero ones').toMatchObject({
      available: false,
      records: [],
      total: 0,
    });
    expect(view.degraded, 'and says so').toBe(true);
    expect(view.transfers, 'nothing is queued before a deletion is asked for').toEqual([]);
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
  });

  test('should refuse a recipient who is not an active member, or a handle that does not match, and change nothing', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botdel-refuse' });
    const bot = await identity.createBot(team, { label: 'botdel-refuse' });
    await issueBotKey(team.ownerCtx, bot);
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
    expect((await detail(team.ownerCtx, bot)).activeKeyCount, 'nor revoked its key').toBe(1);
    expect(await readBotTransfers(bot.botId), 'nor queued a handover').toEqual([]);

    const accepted = await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId });
    expect(accepted.status(), 'the same call with an eligible recipient and the right handle is accepted').toBe(202);
    expect((await detail(team.ownerCtx, bot)).activeKeyCount, 'and revokes the key it left alone before').toBe(0);
  });
});

test.describe('identity bot deletion — the handover', () => {
  test('should queue one handover per bot-aware application, revoke every key and stop the bot at once', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botdel-request' });
    const { bot, authz } = await decidableBot(identity, team, 'botdel-request');
    const key = await issueBotKey(team.ownerCtx, bot);
    const botCtx = await identity.botCaller(key.key);
    const decision = { principalType: 'SERVICE_ACCOUNT' as const, principalId: bot.clientId, organisationId: team.organisationId, action: GUARDED };

    expect(await authz.decide(decision), 'the bot passes policy decisions before the deletion').toMatchObject({ decision: 'PERMIT' });

    const deleted = await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId });
    expect(deleted.status(), await deleted.text()).toBe(202);

    const view = await detail(team.ownerCtx, bot);
    expect(view, 'the bot is deleting with no key left').toMatchObject({ status: 'DELETING', activeKeyCount: 0 });
    expect(view.deletion, 'and reports one outstanding handover to the member it was handed to').toMatchObject({
      pending: 1,
      done: 0,
      failed: 0,
      stalled: false,
      stalledApplications: [],
      transferTo: { id: team.owner.userId },
    });
    expect((await readBotClient(bot.clientId))?.isActive, 'the backing client is deactivated with it').toBe(false);
    expect(
      (await readBotTransfers(bot.botId)).map(row => ({ status: row.status, attempts: row.attempts, toUserId: row.toUserId })),
      'one handover is queued per bot-aware application',
    ).toEqual([{ status: 'PENDING', attempts: 0, toUserId: team.owner.userId }]);
    expect((await ownership(team.ownerCtx, bot)).transfers.map(item => item.name)).toEqual([NOVEL_FORGE]);

    expect(await authz.decide(decision), 'and it stops passing policy decisions immediately').toMatchObject({ decision: 'DENY', reasons: ['the bot is not active'] });
    await expectRefused(await botCtx.get(`/api/v1/organisations/${team.organisationId}/members`), 401, 'AUTH_005', 'the key it held until the deletion');
    await expectRefused(
      await identityMutate(team.ownerCtx, 'post', `${botPath(bot)}/keys`, { name: 'e2e-after', expiresAt: new Date(Date.now() + 60 * MINUTE_MS).toISOString() }),
      409,
      'BOT_010',
      'a new key for a deleting bot',
    );

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
    await expectRefused(await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId }), 409, 'BOT_010', 'a second deletion request');
  });

  test('should keep retrying a queued handover on a widening backoff and report it as stalled once the attempts run out', async ({ identity }) => {
    test.setTimeout(90_000);
    const team = await identity.createTeam({ label: 'botdel-retry' });
    const bot = await identity.createBot(team, { label: 'botdel-retry' });
    expect((await requestDeletion(team.ownerCtx, bot, { transferToUserId: team.owner.userId })).status()).toBe(202);

    const attempted = await waitUntil(
      async () => {
        const [row] = await readBotTransfers(bot.botId);
        return row && row.attempts > 0 ? row : undefined;
      },
      { timeoutMs: WORKER_TIMEOUT_MS, message: 'the worker never attempted the queued handover' },
    );
    expect(attempted, 'an attempt that could not be delivered is recorded as failed, with the reason').toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(attempted.lastError, 'and the error it failed with').toBeTruthy();
    expect(attempted.nextAttemptAt.getTime(), 'the next attempt waits out the first step of the backoff').toBeGreaterThan(Date.now() + MINUTE_MS);
    expect((await detail(team.ownerCtx, bot)).deletion, 'a handover still inside its attempt budget is not stalled').toMatchObject({ pending: 0, failed: 1, stalled: false });

    await updateBotTransfers(bot.botId, { status: 'FAILED', attempts: MAX_BOT_TRANSFER_ATTEMPTS, lastError: 'e2e exhausted' });
    expect((await detail(team.ownerCtx, bot)).deletion, 'one out of attempts stalls the deletion and names the application').toMatchObject({
      failed: 1,
      stalled: true,
      stalledApplications: ['Novel Forge'],
    });
    expect((await ownership(team.ownerCtx, bot)).transfers[0]).toMatchObject({ status: 'FAILED', attempts: MAX_BOT_TRANSFER_ATTEMPTS, exhausted: true });

    const retried = await identityMutate(team.ownerCtx, 'post', `${botPath(bot)}/ownership/retry`);
    expect(retried.status(), await retried.text()).toBe(200);
    expect(await retried.json(), 'the retry says how many handovers it handed back').toEqual({ retried: 1 });
    expect((await readBotTransfers(bot.botId))[0], 'which are queued again with a clean attempt budget').toMatchObject({
      status: 'PENDING',
      attempts: 0,
      lastError: null,
    });
    expect(
      (await findAuditEvents('bot.deletion.requested', bot.botId)).map(row => row.detail?.retriedTransfers),
      'and the retry is audited alongside the request',
    ).toEqual([undefined, 1]);

    const nothingToRetry = await identityMutate(team.ownerCtx, 'post', `${botPath(bot)}/ownership/retry`);
    expect(await nothingToRetry.json(), 'a retry with nothing out of attempts requeues nothing').toEqual({ retried: 0 });

    const live = await identity.createBot(team, { label: 'botdel-retry-live' });
    await expectRefused(await identityMutate(team.ownerCtx, 'post', `${botPath(live)}/ownership/retry`), 409, 'BOT_010', 'retrying handovers for a bot that is not being deleted');
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
