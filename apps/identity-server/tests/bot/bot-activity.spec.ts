import { beforeEach, describe, expect, it } from 'bun:test';

import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { BotKeyService, BotService } from '@server/modules/identity/bot';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

interface ActivityItemJson {
  id: string;
  occurredAt: string;
  action: string;
  outcome: string;
  actorType: string;
  actor?: { id: string; displayName?: string };
  keyId?: string;
  keyName?: string;
  ip?: string;
  detail?: { added?: string[]; removed?: string[]; fields?: string[] };
}

interface ActivityJson {
  events: ActivityItemJson[];
  nextCursor?: string;
}

const env = new TestEnvironment('bot-activity').init();

describe('Bot activity', () => {
  let adminId: bigint;
  let adminSecret: string;
  let orgId: string;
  let botId: string;
  let keyId: string;
  let seq = 0;

  const session = async (userId: bigint) => (await env.getService(SessionService).create({ userId, aal: 'AAL2' })).secret;

  const createUser = async (email: string, displayName?: string): Promise<bigint> =>
    (await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true, displayName })).id;

  const activity = async (query = '', secret = adminSecret): Promise<ActivityJson> => {
    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .get(`/api/v1/organisations/${orgId}/bots/${botId}/activity${query}`)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    expect(response.statusCode).toBe(200);
    return response.json() as ActivityJson;
  };

  beforeEach(async () => {
    const organisations = env.getService(OrganisationService);
    const ownerId = await createUser('owner@example.com');
    adminId = await createUser('admin@example.com', 'Priya Raman');
    orgId = (await organisations.createTeam(ownerId, { name: 'Acme' })).id.toString();
    await organisations.ensureMember(BigInt(orgId), adminId, 'ADMIN');
    adminSecret = await session(adminId);

    const actor = { userId: adminId, ip: '203.0.113.24' };
    const bot = await env.getService(BotService).createBot(actor, BigInt(orgId), { handle: `bot-${seq++}`, displayName: 'Release notes' });
    botId = bot.id.toString();

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const key = await env.getService(BotKeyService).createKey(actor, BigInt(orgId), bot.id, { name: 'ingest-cli-prod', expiresAt });
    keyId = key.id;
    await env.getService(BotService).updateBot(actor, BigInt(orgId), bot.id, { displayName: 'Renamed' });
    await env.getService(BotKeyService).revokeKey(actor, BigInt(orgId), bot.id, key.id);
  });

  it('should return the bot’s own events newest first', async () => {
    const page = await activity();
    expect(page.events.map(event => event.action)).toEqual(['bot.key.revoked', 'bot.updated', 'bot.key.created', 'bot.created']);
    expect(page.nextCursor).toBeUndefined();
  });

  it('should carry the acting user, the key it concerns and the caller address', async () => {
    const [revoked] = (await activity()).events;
    expect(revoked).toMatchObject({ outcome: 'SUCCESS', actorType: 'USER', keyId, keyName: 'ingest-cli-prod', ip: '203.0.113.24' });
    expect(revoked?.actor).toMatchObject({ id: adminId.toString(), displayName: 'Priya Raman' });
  });

  it('should summarise the changed fields of an update', async () => {
    const updated = (await activity()).events.find(event => event.action === 'bot.updated');
    expect(updated?.detail?.fields).toEqual(['displayName']);
  });

  it('should render a permission change as application:resource:level labels', async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .put(`/api/v1/organisations/${orgId}/bots/${botId}/permissions`)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: adminSecret, 'csrf-token': csrf.cookie })
      .body({ grants: [{ applicationId, resource: 'members', level: 'read' }] });
    expect(response.statusCode).toBe(200);

    const changed = (await activity()).events.find(event => event.action === 'bot.permissions.changed');
    expect(changed?.detail?.added).toEqual(['shadow-identity:members:read']);
    expect(changed?.detail?.removed).toEqual([]);
  });

  it('should page stably through a cursor without repeating or skipping an event', async () => {
    const all = (await activity()).events.map(event => event.id);
    const first = await activity('?limit=2');
    expect(first.events.map(event => event.id)).toEqual(all.slice(0, 2));
    expect(first.nextCursor).toBeString();

    const second = await activity(`?limit=2&cursor=${encodeURIComponent(first.nextCursor as string)}`);
    expect(second.events.map(event => event.id)).toEqual(all.slice(2));
    expect(second.nextCursor).toBeUndefined();
  });

  it('should filter by action and by outcome', async () => {
    expect((await activity('?action=bot.key.created')).events.map(event => event.action)).toEqual(['bot.key.created']);
    expect((await activity('?outcome=SUCCESS')).events).toHaveLength(4);
    expect((await activity('?outcome=DENIED')).events).toEqual([]);
  });

  it('should reject a malformed cursor', async () => {
    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .get(`/api/v1/organisations/${orgId}/bots/${botId}/activity?cursor=not-a-cursor`)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: adminSecret, 'csrf-token': csrf.cookie });
    expect(response.statusCode).toBe(422);
  });

  it('should answer another organisation’s bot with BOT_009', async () => {
    const foreignId = await createUser('foreign@example.com');
    const foreignOrgId = (await env.getService(OrganisationService).createTeam(foreignId, { name: 'Globex' })).id.toString();
    const foreignSecret = await session(foreignId);
    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .get(`/api/v1/organisations/${foreignOrgId}/bots/${botId}/activity`)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: foreignSecret, 'csrf-token': csrf.cookie });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe('BOT_009');
  });
});
