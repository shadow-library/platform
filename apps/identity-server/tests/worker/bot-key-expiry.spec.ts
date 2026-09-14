import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { eq, inArray } from 'drizzle-orm';

import { BotKeyService, BotService } from '@server/modules/identity/bot';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { LogSamplerService } from '@server/modules/infrastructure/security';
import { BotKeyExpiryService } from '@server/modules/worker';

import { TestEnvironment } from '../test-environment';

const DAY_MS = 24 * 60 * 60 * 1000;

const env = new TestEnvironment('bot-key-expiry').init();

const originalEnqueueMany = NotificationService.prototype.enqueueMany;
const originalAuditRecord = AuditService.prototype.record;
afterEach(() => {
  NotificationService.prototype.enqueueMany = originalEnqueueMany;
  AuditService.prototype.record = originalAuditRecord;
});

describe('BotKeyExpiryService', () => {
  let db: PrimaryDatabase;
  let service: BotKeyExpiryService;
  let userService: UserService;
  let organisationService: OrganisationService;
  let botService: BotService;
  let botKeyService: BotKeyService;
  let seq = 0;

  const expiryIn = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString();

  const createUser = async (email: string, emailVerified = true): Promise<bigint> =>
    (await userService.createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified })).id;

  const createOrganisation = async (): Promise<{ organisationId: bigint; ownerId: bigint; ownerEmail: string; adminId: bigint; adminEmail: string; memberId: bigint }> => {
    const n = seq++;
    const ownerEmail = `owner-${n}@example.com`;
    const adminEmail = `admin-${n}@example.com`;
    const ownerId = await createUser(ownerEmail);
    const adminId = await createUser(adminEmail);
    const memberId = await createUser(`member-${n}@example.com`);
    const organisationId = (await organisationService.createTeam(ownerId, { name: `Org ${n}` })).id;
    await organisationService.ensureMember(organisationId, adminId, 'ADMIN');
    await organisationService.ensureMember(organisationId, memberId, 'MEMBER');
    return { organisationId, ownerId, ownerEmail, adminId, adminEmail, memberId };
  };

  const unverifyAdmins = async (org: { ownerId: bigint; adminId: bigint }): Promise<void> => {
    await db
      .update(schema.userEmails)
      .set({ verifiedAt: null })
      .where(inArray(schema.userEmails.userId, [org.ownerId, org.adminId]));
  };

  const createBotKey = async (organisationId: bigint, actorUserId: bigint, expiresInDays: number): Promise<{ id: string; botId: bigint; botHandle: string }> => {
    const bot = await botService.createBot({ userId: actorUserId }, organisationId, { handle: `bot-${seq++}`, displayName: 'Release Bot' });
    const key = await botKeyService.createKey({ userId: actorUserId }, organisationId, bot.id, { name: `key-${seq++}`, expiresAt: expiryIn(90) });
    await db
      .update(schema.botKeys)
      .set({ expiresAt: new Date(Date.now() + expiresInDays * DAY_MS) })
      .where(eq(schema.botKeys.id, key.id));
    return { id: key.id, botId: bot.id, botHandle: bot.handle };
  };

  beforeEach(() => {
    db = env.getPostgresClient();
    service = new BotKeyExpiryService(env.getDatabaseService(), env.getService(NotificationService), env.getService(AuditService), env.getService(LogSamplerService));
    userService = env.getService(UserService);
    organisationService = env.getService(OrganisationService);
    botService = env.getService(BotService);
    botKeyService = env.getService(BotKeyService);
  });

  describe('remindExpiringKeys', () => {
    it('should send a reminder exactly once per expiring key', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);

      const reminded = await service.remindExpiringKeys();
      expect(reminded).toBe(1);

      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(row?.expiryRemindedAt).not.toBeNull();

      const notified = await service.remindExpiringKeys();
      expect(notified).toBe(0);
    });

    it('should notify only the organisation OWNER and ADMIN, not a plain member', async () => {
      const org = await createOrganisation();
      await createBotKey(org.organisationId, org.ownerId, 5);

      await service.remindExpiringKeys();

      const outbox = await db.select().from(schema.notificationOutbox);
      expect(outbox).toHaveLength(2);
      const recipientEmails = outbox.map(row => (row.recipients as { email?: string }).email).sort();
      expect(recipientEmails).toEqual([org.adminEmail, org.ownerEmail].sort());
    });

    it('should skip a key that has already been reminded', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);
      await db.update(schema.botKeys).set({ expiryRemindedAt: new Date() }).where(eq(schema.botKeys.id, key.id));

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(0);
      expect(await db.select().from(schema.notificationOutbox)).toHaveLength(0);
    });

    it('should skip a revoked key', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);
      await db.update(schema.botKeys).set({ revokedAt: new Date() }).where(eq(schema.botKeys.id, key.id));

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(0);
      expect(await db.select().from(schema.notificationOutbox)).toHaveLength(0);
    });

    it('should skip keys expiring outside the 7-day reminder window', async () => {
      const org = await createOrganisation();
      await createBotKey(org.organisationId, org.ownerId, 30);

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(0);
      expect(await db.select().from(schema.notificationOutbox)).toHaveLength(0);
    });

    it('should skip a key that has already expired', async () => {
      const org = await createOrganisation();
      await createBotKey(org.organisationId, org.ownerId, -1);

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(0);
      expect(await db.select().from(schema.notificationOutbox)).toHaveLength(0);
    });

    it('should skip a key whose organisation is not ACTIVE', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);
      await db.update(schema.organisations).set({ status: 'DELETED' }).where(eq(schema.organisations.id, org.organisationId));

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(0);
      expect(await db.select().from(schema.notificationOutbox)).toHaveLength(0);
      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(row?.expiryRemindedAt).toBeNull();
    });

    it('should skip a key whose bot is DELETED', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);
      await db.update(schema.bots).set({ status: 'DELETED' }).where(eq(schema.bots.id, key.botId));

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(0);
      expect(await db.select().from(schema.notificationOutbox)).toHaveLength(0);
    });

    it('should still remind the owners of a SUSPENDED bot', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);
      await db.update(schema.bots).set({ status: 'SUSPENDED' }).where(eq(schema.bots.id, key.botId));

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(1);
    });

    it('should leave a key remindable when no recipient has a verified email', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);
      await unverifyAdmins(org);

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(0);
      expect(await db.select().from(schema.notificationOutbox)).toHaveLength(0);
      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(row?.expiryRemindedAt).toBeNull();
    });

    it('should remind a key on a later tick once an owner verifies their email', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);
      await unverifyAdmins(org);
      expect(await service.remindExpiringKeys()).toBe(0);

      await db.update(schema.userEmails).set({ verifiedAt: new Date() }).where(eq(schema.userEmails.userId, org.ownerId));

      expect(await service.remindExpiringKeys()).toBe(1);
      const outbox = await db.select().from(schema.notificationOutbox);
      expect(outbox.map(row => (row.recipients as { email?: string }).email)).toEqual([org.ownerEmail]);
      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(row?.expiryRemindedAt).not.toBeNull();
    });

    it('should warn at most once a day about an organisation with no notifiable recipient', async () => {
      const org = await createOrganisation();
      await createBotKey(org.organisationId, org.ownerId, 3);
      await unverifyAdmins(org);
      const warn = spyOn(service['logger'], 'warn');

      await service.remindExpiringKeys();
      await service.remindExpiringKeys();

      expect(warn.mock.calls).toHaveLength(1);
      expect(warn.mock.calls[0]?.[1]).toMatchObject({ organisationId: org.organisationId.toString(), keyCount: 1 });
      warn.mockRestore();
    });

    it('should not double-send if the claim is re-attempted for an already-claimed key', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, 3);

      const [first, second] = await Promise.all([service.remindExpiringKeys(), service.remindExpiringKeys()]);

      expect(first + second).toBe(1);
      const outbox = await db.select().from(schema.notificationOutbox);
      expect(outbox).toHaveLength(2);
      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(row?.expiryRemindedAt).not.toBeNull();
    });

    it('should not stamp a key as reminded when the organisation notification work fails, and keeps processing other organisations', async () => {
      const failingOrg = await createOrganisation();
      const failingKey = await createBotKey(failingOrg.organisationId, failingOrg.ownerId, 3);
      const healthyOrg = await createOrganisation();
      const healthyKey = await createBotKey(healthyOrg.organisationId, healthyOrg.ownerId, 3);

      NotificationService.prototype.enqueueMany = async function failingEnqueueMany(this: NotificationService, ...args: Parameters<typeof originalEnqueueMany>): Promise<void> {
        const [notifications] = args;
        if (notifications.some(notification => (notification.payload as { botHandle?: string } | undefined)?.botHandle === failingKey.botHandle))
          throw new Error('outbox insert failed');
        return originalEnqueueMany.apply(this, args);
      };

      const reminded = await service.remindExpiringKeys();

      expect(reminded).toBe(1);
      const failingRow = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, failingKey.id) });
      expect(failingRow?.expiryRemindedAt).toBeNull();
      const healthyRow = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, healthyKey.id) });
      expect(healthyRow?.expiryRemindedAt).not.toBeNull();
    });
  });

  describe('sweepExpiredKeys', () => {
    it('should record bot.key.expired exactly once per key', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, -1);

      const audited = await service.sweepExpiredKeys();
      expect(audited).toBe(1);

      const events = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.key.expired'));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorType: 'SYSTEM', actorId: null, targetType: 'bot_key', targetId: key.id, organisationId: org.organisationId.toString() });

      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(row?.expiryAuditedAt).not.toBeNull();

      const secondSweep = await service.sweepExpiredKeys();
      expect(secondSweep).toBe(0);
      expect(await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.key.expired'))).toHaveLength(1);
    });

    it('should not audit a key that has not expired yet', async () => {
      const org = await createOrganisation();
      await createBotKey(org.organisationId, org.ownerId, 3);

      const audited = await service.sweepExpiredKeys();

      expect(audited).toBe(0);
      expect(await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.key.expired'))).toHaveLength(0);
    });

    it('should skip a revoked key even after it has passed its expiry', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, -1);
      await db.update(schema.botKeys).set({ revokedAt: new Date() }).where(eq(schema.botKeys.id, key.id));

      const audited = await service.sweepExpiredKeys();

      expect(audited).toBe(0);
      expect(await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.key.expired'))).toHaveLength(0);
    });

    it('should not stamp a key as audited when the audit write fails, so the key is re-swept next time', async () => {
      const org = await createOrganisation();
      const key = await createBotKey(org.organisationId, org.ownerId, -1);

      AuditService.prototype.record = async () => {
        throw new Error('audit write failed');
      };

      const firstSweep = await service.sweepExpiredKeys();
      expect(firstSweep).toBe(0);
      const claimedRow = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(claimedRow?.expiryAuditedAt).toBeNull();
      expect(await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.key.expired'))).toHaveLength(0);

      AuditService.prototype.record = originalAuditRecord;
      const secondSweep = await service.sweepExpiredKeys();
      expect(secondSweep).toBe(1);
      const auditedRow = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(auditedRow?.expiryAuditedAt).not.toBeNull();
    });
  });
});
