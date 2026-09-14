import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { BotOwnershipService, MAX_TRANSFER_ATTEMPTS } from '@server/modules/identity/bot-ownership';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

type Method = 'get' | 'post' | 'delete';

interface TransferItemJson {
  applicationId: number;
  name: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  attempts: number;
  exhausted: boolean;
}

interface OwnershipJson {
  applications: { applicationId: number; name: string; available: boolean; records: { kind: string; count: number }[]; total: number }[];
  degraded: boolean;
  transfers: TransferItemJson[];
  recipients: { userId: string; role: string; displayName?: string; email?: string }[];
}

interface BotJson {
  id: string;
  clientId: string;
  handle: string;
  status: string;
  activeKeyCount: number;
  deletion?: { requestedAt: string; transferTo?: { id: string }; pending: number; done: number; failed: number; stalled: boolean };
}

const SECOND_APPLICATION = 'demo-forge';

interface FakeApplication {
  port: number;
  ownership: Record<string, number>;
  transfers: { botId: string; toUserId: string }[];
  ownershipStatus: number;
  transferStatus: number;
  stop: () => void;
}

function serveApplication(ownership: Record<string, number>): FakeApplication {
  const state = { ownership, transfers: [] as { botId: string; toUserId: string }[], ownershipStatus: 200, transferStatus: 200 };
  const server = Bun.serve({
    port: 0,
    fetch: async request => {
      const url = new URL(request.url);
      const botId = url.pathname.split('/')[3] ?? '';
      if (url.pathname.endsWith('/ownership')) return Response.json(state.ownership, { status: state.ownershipStatus });
      const body = (await request.json()) as { toUserId: string };
      if (state.transferStatus >= 400) return Response.json({ code: 'NF_500' }, { status: state.transferStatus });
      state.transfers.push({ botId, toUserId: body.toUserId });
      return Response.json(state.ownership, { status: 200 });
    },
  });
  return Object.assign(state, { port: server.port as number, stop: () => void server.stop(true) });
}

const novelForge = serveApplication({ projects: 42, illustrations: 318 });
const demoForge = serveApplication({ documents: 7 });
process.env['SERVICE_URL_NOVEL_FORGE_SERVER'] = `http://localhost:${novelForge.port}`;
process.env[`SERVICE_URL_${SECOND_APPLICATION.toUpperCase().replace(/-/g, '_')}_SERVER`] = `http://localhost:${demoForge.port}`;

const env = new TestEnvironment('bot_deletion').init();
afterAll(() => {
  novelForge.stop();
  demoForge.stop();
});

describe('Organisation bot deletion', () => {
  let db: PrimaryDatabase;
  let ownerId: bigint;
  let adminId: bigint;
  let memberId: bigint;
  let foreignId: bigint;
  let adminSecret: string;
  let adminAal1Secret: string;
  let memberSecret: string;
  let foreignSecret: string;
  let orgId: string;
  let foreignOrgId: string;
  let secondApplicationId: number;
  let seq = 0;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const mock = env.getRouter().mockRequest();
    const chain = mock[method](path)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint, aal: 'AAL1' | 'AAL2' = 'AAL2') => (await env.getService(SessionService).create({ userId, aal })).secret;

  const basePath = (organisationId: string = orgId): string => `/api/v1/organisations/${organisationId}/bots`;

  const codeOf = (response: { json: () => unknown }): string => (response.json() as { code: string }).code;

  const createUser = async (email: string): Promise<bigint> =>
    (await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;

  const createBot = async (handle = `bot-${seq++}`): Promise<BotJson> => {
    const response = await request('post', basePath(), adminSecret, { handle, displayName: 'Release notes' });
    expect(response.statusCode).toBe(201);
    return response.json() as BotJson;
  };

  const createKey = async (botId: string): Promise<string> => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const response = await request('post', `${basePath()}/${botId}/keys`, adminSecret, { name: `key-${seq++}`, expiresAt });
    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  };

  const getBot = async (botId: string): Promise<BotJson> => {
    const response = await request('get', `${basePath()}/${botId}`, adminSecret);
    expect(response.statusCode).toBe(200);
    return response.json() as BotJson;
  };

  const getOwnership = async (botId: string, secret = adminSecret): Promise<OwnershipJson> => {
    const response = await request('get', `${basePath()}/${botId}/ownership`, secret);
    expect(response.statusCode).toBe(200);
    return response.json() as OwnershipJson;
  };

  const deleteBot = (botId: string, body: Record<string, unknown>, secret = adminSecret, organisationId = orgId) =>
    request('delete', `${basePath(organisationId)}/${botId}`, secret, body);

  const requestDeletion = async (bot: BotJson, toUserId: bigint = memberId): Promise<void> => {
    const response = await deleteBot(bot.id, { transferToUserId: toUserId.toString(), confirmHandle: bot.handle });
    expect(response.statusCode).toBe(202);
  };

  const auditActions = async (botId: string): Promise<string[]> => {
    const events = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, botId));
    return events.map(event => event.action);
  };

  const transferRows = (botId: string) =>
    db
      .select()
      .from(schema.botOwnershipTransfers)
      .where(eq(schema.botOwnershipTransfers.botId, BigInt(botId)));

  /** Backdated with the database clock, so the claim window never turns on skew between Postgres and this process. */
  const releaseTransfers = (botId: string) =>
    db
      .update(schema.botOwnershipTransfers)
      .set({ nextAttemptAt: sql`now() - interval '1 minute'` })
      .where(eq(schema.botOwnershipTransfers.botId, BigInt(botId)));

  /** A second bot-aware application proves the registry is read from the grants rather than hard-coded. */
  const registerSecondApplication = async (): Promise<void> => {
    const applications = env.getService(ApplicationService);
    /** The cache outlives the per-test template restore, so it is refreshed before anything reads an application id from it. */
    await applications.loadApplications();
    const application = applications.getApplication(SECOND_APPLICATION) ?? (await applications.createApplication({ name: SECOND_APPLICATION, subDomain: SECOND_APPLICATION }));
    secondApplicationId = application.id;

    const oauthClients = env.getService(OAuthClientService);
    const scopeId = await oauthClients.ensureScope(application.id, `api://${SECOND_APPLICATION}`, `${SECOND_APPLICATION}:bots:manage`, 'SERVICE');
    await oauthClients.grantScope('identity-server', scopeId);
  };

  beforeEach(async () => {
    db = env.getPostgresClient();
    novelForge.transfers.length = 0;
    demoForge.transfers.length = 0;
    novelForge.ownershipStatus = 200;
    demoForge.ownershipStatus = 200;
    novelForge.transferStatus = 200;
    demoForge.transferStatus = 200;

    const organisations = env.getService(OrganisationService);
    ownerId = await createUser('owner@example.com');
    adminId = await createUser('admin@example.com');
    memberId = await createUser('member@example.com');
    foreignId = await createUser('foreign@example.com');

    orgId = (await organisations.createTeam(ownerId, { name: 'Acme' })).id.toString();
    foreignOrgId = (await organisations.createTeam(foreignId, { name: 'Globex' })).id.toString();
    await organisations.ensureMember(BigInt(orgId), adminId, 'ADMIN');
    await organisations.ensureMember(BigInt(orgId), memberId, 'MEMBER');

    adminSecret = await session(adminId);
    adminAal1Secret = await session(adminId, 'AAL1');
    memberSecret = await session(memberId);
    foreignSecret = await session(foreignId);

    await registerSecondApplication();
  });

  describe('GET /api/v1/organisations/:organisationId/bots/:botId/ownership', () => {
    it('should report the counts every bot-aware application declares', async () => {
      const bot = await createBot();

      const ownership = await getOwnership(bot.id);

      expect(ownership.degraded).toBe(false);
      expect(ownership.transfers).toEqual([]);
      expect(ownership.applications.map(application => application.name).sort()).toEqual([SECOND_APPLICATION, 'novel-forge']);
      const forge = ownership.applications.find(application => application.name === 'novel-forge');
      expect(forge).toMatchObject({ available: true, total: 360 });
      expect(forge?.records).toEqual([
        { kind: 'projects', count: 42 },
        { kind: 'illustrations', count: 318 },
      ]);
    });

    it('should degrade rather than fail when an application does not answer', async () => {
      const bot = await createBot();
      novelForge.ownershipStatus = 503;

      const ownership = await getOwnership(bot.id);

      expect(ownership.degraded).toBe(true);
      expect(ownership.applications.find(application => application.name === 'novel-forge')).toMatchObject({ available: false, records: [], total: 0 });
      expect(ownership.applications.find(application => application.name === SECOND_APPLICATION)).toMatchObject({ available: true, total: 7 });
    });

    it('should stay readable to a non-elevated admin and closed to everyone else', async () => {
      const bot = await createBot();

      expect((await request('get', `${basePath()}/${bot.id}/ownership`, adminAal1Secret)).statusCode).toBe(200);
      expect(codeOf(await request('get', `${basePath()}/${bot.id}/ownership`, memberSecret))).toBe('ORG_007');
      expect(codeOf(await request('get', `${basePath(foreignOrgId)}/${bot.id}/ownership`, foreignSecret))).toBe('BOT_009');
    });
  });

  describe('DELETE /api/v1/organisations/:organisationId/bots/:botId', () => {
    it('should demand a stepped-up session', async () => {
      const bot = await createBot();

      const response = await deleteBot(bot.id, { transferToUserId: memberId.toString(), confirmHandle: bot.handle }, adminAal1Secret);

      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('AUTH_006');
      expect((await getBot(bot.id)).status).toBe('ACTIVE');
    });

    it('should refuse a plain member and another organisation’s admin', async () => {
      const bot = await createBot();
      const body = { transferToUserId: memberId.toString(), confirmHandle: bot.handle };

      expect(codeOf(await deleteBot(bot.id, body, memberSecret))).toBe('ORG_007');
      expect(codeOf(await deleteBot(bot.id, body, foreignSecret, foreignOrgId))).toBe('BOT_009');
      expect((await getBot(bot.id)).status).toBe('ACTIVE');
    });

    it('should refuse a recipient who is not an active member with BOT_008', async () => {
      const bot = await createBot();
      const outsider = await createUser('outsider@example.com');
      await db
        .update(schema.organisationMembers)
        .set({ status: 'SUSPENDED' })
        .where(and(eq(schema.organisationMembers.organisationId, BigInt(orgId)), eq(schema.organisationMembers.userId, memberId)));

      for (const recipient of [outsider, foreignId, memberId]) {
        const response = await deleteBot(bot.id, { transferToUserId: recipient.toString(), confirmHandle: bot.handle });
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('BOT_008');
      }
      expect((await getBot(bot.id)).status).toBe('ACTIVE');
    });

    it('should refuse a closed account with BOT_008 even though its membership stays ACTIVE', async () => {
      const bot = await createBot();
      const closed = await createUser('closed@example.com');
      await env.getService(OrganisationService).ensureMember(BigInt(orgId), closed, 'MEMBER');
      await db.update(schema.users).set({ status: 'CLOSED' }).where(eq(schema.users.id, closed));

      const response = await deleteBot(bot.id, { transferToUserId: closed.toString(), confirmHandle: bot.handle });

      expect(response.statusCode).toBe(400);
      expect(codeOf(response)).toBe('BOT_008');
      expect(
        await db.query.organisationMembers.findFirst({ where: and(eq(schema.organisationMembers.organisationId, BigInt(orgId)), eq(schema.organisationMembers.userId, closed)) }),
      ).toMatchObject({ status: 'ACTIVE' });
      expect((await getBot(bot.id)).status).toBe('ACTIVE');
    });

    it('should leave a closed account out of the recipients the picker renders', async () => {
      const bot = await createBot();
      const closed = await createUser('closed-listed@example.com');
      await env.getService(OrganisationService).ensureMember(BigInt(orgId), closed, 'MEMBER');
      await db.update(schema.users).set({ status: 'CLOSED' }).where(eq(schema.users.id, closed));

      const recipients = (await getOwnership(bot.id)).recipients;

      expect(recipients.map(recipient => recipient.userId)).not.toContain(closed.toString());
      expect(recipients.map(recipient => recipient.userId)).toContain(memberId.toString());
      expect(recipients.find(recipient => recipient.userId === memberId.toString())).toMatchObject({ role: 'MEMBER', email: 'member@example.com' });
    });

    it('should keep the recipient list off the member endpoint every member and members-read bot can call', async () => {
      const response = await request('get', `/api/v1/organisations/${orgId}/members`, memberSecret);
      const members = (response.json() as { members: Record<string, unknown>[] }).members;

      expect(members.length).toBeGreaterThan(0);
      expect(members.every(member => !('accountActive' in member))).toBe(true);
    });

    it('should refuse a confirmation that does not match the handle', async () => {
      const bot = await createBot('release-notes');

      const response = await deleteBot(bot.id, { transferToUserId: memberId.toString(), confirmHandle: 'release-note' });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ fields: [{ field: 'confirmHandle' }] });
      expect((await getBot(bot.id)).status).toBe('ACTIVE');
      expect(await transferRows(bot.id)).toHaveLength(0);
    });

    it('should revoke every key, suspend the bot and enqueue one transfer per bot-aware application', async () => {
      const bot = await createBot();
      await createKey(bot.id);
      await createKey(bot.id);

      await requestDeletion(bot);

      const detail = await getBot(bot.id);
      expect(detail.status).toBe('DELETING');
      expect(detail.activeKeyCount).toBe(0);
      expect(detail.deletion).toMatchObject({ pending: 2, done: 0, failed: 0, stalled: false, transferTo: { id: memberId.toString() } });
      expect(await db.$count(schema.botKeys, and(eq(schema.botKeys.botId, BigInt(bot.id)), isNull(schema.botKeys.revokedAt)))).toBe(0);

      const client = await db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, bot.clientId) });
      expect(client?.isActive).toBe(false);

      const rows = await transferRows(bot.id);
      expect(rows).toHaveLength(2);
      expect(rows.map(row => row.applicationId)).toContain(secondApplicationId);
      expect(rows.every(row => row.status === 'PENDING' && row.attempts === 0 && row.toUserId === memberId)).toBe(true);
      expect(await auditActions(bot.id)).toContain('bot.deletion.requested');
    });

    it('should stop the bot passing permission checks as soon as deletion is requested', async () => {
      const bot = await createBot();
      const check = () =>
        env.getService(PolicyDecisionService).check({ principal: { type: 'SERVICE_ACCOUNT', id: bot.clientId }, organisationId: orgId, action: 'identity:org:members:read' });

      expect((await check()).reasons).not.toContain('the bot is not active');

      await requestDeletion(bot);

      const decision = await check();
      expect(decision.decision).toBe('DENY');
      expect(decision.reasons).toContain('the bot is not active');
      expect((await db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, bot.clientId) }))?.isActive).toBe(false);
    });

    it('should refuse a second deletion request with BOT_010', async () => {
      const bot = await createBot();
      await requestDeletion(bot);

      const response = await deleteBot(bot.id, { transferToUserId: memberId.toString(), confirmHandle: bot.handle });

      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('BOT_010');
      expect(await transferRows(bot.id)).toHaveLength(2);
    });
  });

  describe('worker drain', () => {
    const drain = () => env.getService(BotOwnershipService).dispatchPending();

    it('should finish the deletion only once every application confirms', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      demoForge.transferStatus = 500;

      expect(await drain()).toBe(1);
      expect((await getBot(bot.id)).status).toBe('DELETING');
      expect(novelForge.transfers).toEqual([{ botId: bot.id, toUserId: memberId.toString() }]);

      demoForge.transferStatus = 200;
      await releaseTransfers(bot.id);

      expect(await drain()).toBe(1);
      const row = await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) });
      expect(row?.status).toBe('DELETED');
      expect(row?.deletedAt).not.toBeNull();
      expect(await auditActions(bot.id)).toContain('bot.ownership.transferred');
      expect(await auditActions(bot.id)).toContain('bot.deleted');
    });

    it('should not call an application again once its transfer is done', async () => {
      const bot = await createBot();
      await requestDeletion(bot);

      await drain();
      await releaseTransfers(bot.id);
      expect(await drain()).toBe(0);

      expect(novelForge.transfers).toHaveLength(1);
      expect(demoForge.transfers).toHaveLength(1);
      expect((await transferRows(bot.id)).every(row => row.status === 'DONE')).toBe(true);
    });

    it('should keep the handle reserved after the bot is deleted', async () => {
      const bot = await createBot('release-notes');
      await requestDeletion(bot);
      await drain();

      expect((await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) }))?.status).toBe('DELETED');
      const reused = await request('post', basePath(), adminSecret, { handle: 'release-notes', displayName: 'Second' });
      expect(reused.statusCode).toBe(409);
      expect(codeOf(reused)).toBe('BOT_003');
    });

    it('should drop a deleted bot from the listing but keep it out of the handle pool', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      await drain();

      const listing = (await request('get', basePath(), adminSecret).then(response => response.json())) as { bots: BotJson[] };
      expect(listing.bots.map(item => item.id)).not.toContain(bot.id);
      expect(codeOf(await request('get', `${basePath()}/${bot.id}`, adminSecret))).toBe('BOT_009');
    });

    it('should surface a transfer that has used its whole attempt budget instead of stalling silently', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      novelForge.transferStatus = 500;
      demoForge.transferStatus = 500;

      for (let attempt = 0; attempt < MAX_TRANSFER_ATTEMPTS; attempt++) {
        await releaseTransfers(bot.id);
        await drain();
      }

      const rows = await transferRows(bot.id);
      expect(rows.every(row => row.status === 'FAILED' && row.attempts === MAX_TRANSFER_ATTEMPTS)).toBe(true);

      await releaseTransfers(bot.id);
      expect(await drain()).toBe(0);

      expect((await getBot(bot.id)).deletion).toMatchObject({ pending: 0, done: 0, failed: 2, stalled: true });
      expect((await getOwnership(bot.id)).transfers.every(transfer => transfer.exhausted)).toBe(true);
    });

    it('should hand exhausted transfers back to the worker on retry', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      await db
        .update(schema.botOwnershipTransfers)
        .set({ status: 'FAILED', attempts: MAX_TRANSFER_ATTEMPTS, lastError: 'boom' })
        .where(eq(schema.botOwnershipTransfers.botId, BigInt(bot.id)));

      const retried = await request('post', `${basePath()}/${bot.id}/ownership/retry`, adminSecret, {});
      expect(retried.statusCode).toBe(200);
      expect(retried.json()).toEqual({ retried: 2 });

      expect((await transferRows(bot.id)).every(row => row.status === 'PENDING' && row.attempts === 0)).toBe(true);
      await drain();
      expect((await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) }))?.status).toBe('DELETED');
    });

    it('should report that nothing was requeued when no transfer has run out of attempts', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      novelForge.transferStatus = 500;
      demoForge.transferStatus = 500;
      await drain();

      const response = await request('post', `${basePath()}/${bot.id}/ownership/retry`, adminSecret, {});

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ retried: 0 });
      expect((await transferRows(bot.id)).every(row => row.status === 'FAILED' && row.attempts === 1)).toBe(true);
    });

    it('should refuse a retry for a bot that is not being deleted', async () => {
      const bot = await createBot();

      const response = await request('post', `${basePath()}/${bot.id}/ownership/retry`, adminSecret, {});

      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('BOT_010');
    });

    it('should guard the retry route exactly as the deletion route is guarded', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      const path = `${basePath()}/${bot.id}/ownership/retry`;

      expect(codeOf(await request('post', path, adminAal1Secret, {}))).toBe('AUTH_006');
      expect(codeOf(await request('post', path, memberSecret, {}))).toBe('ORG_007');
      expect(codeOf(await request('post', `${basePath(foreignOrgId)}/${bot.id}/ownership/retry`, foreignSecret, {}))).toBe('BOT_009');
    });

    it('should complete a deletion stranded by a worker that died after the last transfer landed', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      /** Exactly the state a SIGTERM between the final markDone commit and finalisation leaves behind: every row DONE, the bot still DELETING. */
      await db
        .update(schema.botOwnershipTransfers)
        .set({ status: 'DONE', completedAt: new Date() })
        .where(eq(schema.botOwnershipTransfers.botId, BigInt(bot.id)));
      expect(await drain()).toBe(0);
      expect((await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) }))?.status).toBe('DELETING');

      expect(await env.getService(BotOwnershipService).recoverCompletedDeletions()).toBe(1);

      const row = await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) });
      expect(row?.status).toBe('DELETED');
      expect(row?.deletedAt).not.toBeNull();
      expect(await auditActions(bot.id)).toContain('bot.deleted');
    });

    it('should surface a row stranded PENDING at the attempt cap rather than hiding it from the claim, the state and the retry', async () => {
      const bot = await createBot();
      await requestDeletion(bot);
      /** What a failed DONE write leaves behind: the attempt is spent but the status never moved off PENDING. */
      await db
        .update(schema.botOwnershipTransfers)
        .set({ status: 'PENDING', attempts: MAX_TRANSFER_ATTEMPTS })
        .where(eq(schema.botOwnershipTransfers.botId, BigInt(bot.id)));

      await releaseTransfers(bot.id);
      expect(await drain()).toBe(0);

      expect((await getBot(bot.id)).deletion).toMatchObject({ stalled: true });
      expect((await getOwnership(bot.id)).transfers.every(transfer => transfer.exhausted)).toBe(true);

      const retried = await request('post', `${basePath()}/${bot.id}/ownership/retry`, adminSecret, {});
      expect(retried.json()).toEqual({ retried: 2 });
      await drain();
      expect((await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) }))?.status).toBe('DELETED');
    });

    it('should refuse to delete an application that still has transfers in flight', async () => {
      const bot = await createBot();
      await requestDeletion(bot);

      await expect(env.getService(ApplicationService).deleteApplication(SECOND_APPLICATION)).rejects.toMatchObject({ code: 'APP_014' });
      expect(await transferRows(bot.id)).toHaveLength(2);
    });

    it('should leave a deletion with outstanding transfers alone when sweeping', async () => {
      const bot = await createBot();
      await requestDeletion(bot);

      expect(await env.getService(BotOwnershipService).recoverCompletedDeletions()).toBe(0);
      expect((await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) }))?.status).toBe('DELETING');
    });
  });

  describe('with no bot-aware application', () => {
    it('should complete the deletion immediately', async () => {
      const oauthClients = env.getService(OAuthClientService);
      await db.delete(schema.oauthClientScopeGrants).where(eq(schema.oauthClientScopeGrants.clientId, 'identity-server'));
      expect(await oauthClients.getGrantedScopeNames('identity-server')).toEqual([]);

      const bot = await createBot();
      await requestDeletion(bot);

      const row = await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) });
      expect(row?.status).toBe('DELETED');
      expect(row?.deletedAt).not.toBeNull();
      expect(await transferRows(bot.id)).toHaveLength(0);
      expect(await auditActions(bot.id)).toContain('bot.deleted');
    });
  });
});
