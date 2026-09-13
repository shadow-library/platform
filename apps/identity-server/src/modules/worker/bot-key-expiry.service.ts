import { and, asc, eq, gt, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { type Bot, DatabaseService, Organisation, PrimaryDatabase, PrimaryTransaction, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService, type SendNotification } from '@server/modules/infrastructure/notification';

interface ExpiringKeyCandidate {
  id: string;
  botId: bigint;
  name: string;
  keyPrefix: string;
  expiresAt: Date;
  organisationId: bigint;
  botHandle: string;
  botDisplayName: string;
}

type ExpiredKeyCandidate = Omit<ExpiringKeyCandidate, 'botHandle' | 'botDisplayName'>;

const BOT_KEY_EXPIRING_TEMPLATE = 'bot.key.expiring';
const REMINDER_WINDOW_DAYS = 7;
const REMINDER_BATCH_LIMIT = 200;
const EXPIRY_SWEEP_BATCH_LIMIT = 200;
const NOTIFIABLE_ROLES: Organisation.MemberRole[] = ['OWNER', 'ADMIN'];
/** Excludes DELETED/DELETING bots — their keys are moot. A SUSPENDED bot's owners still get reminded: the bot can be resumed, and a key that lapses while suspended just means more work at resume time. */
const REMINDABLE_BOT_STATUSES: Bot.Status[] = ['ACTIVE', 'SUSPENDED'];

@Injectable()
export class BotKeyExpiryService {
  private readonly logger = Logger.getLogger(APP_NAME, BotKeyExpiryService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Claiming (stamping `expiryRemindedAt`) and enqueueing the notifications happen in the same
   * per-organisation transaction, so a failure resolving recipients or writing the outbox rolls the
   * claim back too — the key is retried on the next tick instead of silently going unreminded.
   */
  async remindExpiringKeys(): Promise<number> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const candidates = await this.db
      .select({
        id: schema.botKeys.id,
        botId: schema.botKeys.botId,
        name: schema.botKeys.name,
        keyPrefix: schema.botKeys.keyPrefix,
        expiresAt: schema.botKeys.expiresAt,
        organisationId: schema.bots.organisationId,
        botHandle: schema.bots.handle,
        botDisplayName: schema.bots.displayName,
      })
      .from(schema.botKeys)
      .innerJoin(schema.bots, eq(schema.bots.id, schema.botKeys.botId))
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.bots.organisationId))
      .where(
        and(
          isNull(schema.botKeys.revokedAt),
          isNull(schema.botKeys.expiryRemindedAt),
          gt(schema.botKeys.expiresAt, now),
          lte(schema.botKeys.expiresAt, windowEnd),
          eq(schema.organisations.status, 'ACTIVE'),
          inArray(schema.bots.status, REMINDABLE_BOT_STATUSES),
        ),
      )
      .orderBy(asc(schema.botKeys.expiresAt))
      .limit(REMINDER_BATCH_LIMIT);
    if (candidates.length === 0) return 0;

    const byOrganisation = new Map<bigint, ExpiringKeyCandidate[]>();
    for (const candidate of candidates) {
      const group = byOrganisation.get(candidate.organisationId);
      if (group) group.push(candidate);
      else byOrganisation.set(candidate.organisationId, [candidate]);
    }

    let reminded = 0;
    for (const [organisationId, keys] of byOrganisation) {
      try {
        reminded += await this.remindOrganisation(organisationId, keys);
      } catch (error) {
        this.logger.error('failed to send bot key expiry reminders for organisation', { organisationId: organisationId.toString(), error });
      }
    }
    return reminded;
  }

  /**
   * The claim (stamping `expiryAuditedAt`) and the audit write share one transaction, so an audit
   * failure (the hash-chain advisory lock, a webhook fan-out failure, a dropped connection) rolls
   * the claim back too — the key is re-swept next tick instead of being silently excluded from then
   * on. Expired keys already fail authentication — this only leaves a durable trail, so a key
   * already revoked before it expired is left alone: its terminal audit event is `bot.key.revoked`.
   */
  async sweepExpiredKeys(): Promise<number> {
    const now = new Date();
    const candidates: ExpiredKeyCandidate[] = await this.db
      .select({
        id: schema.botKeys.id,
        botId: schema.botKeys.botId,
        name: schema.botKeys.name,
        keyPrefix: schema.botKeys.keyPrefix,
        expiresAt: schema.botKeys.expiresAt,
        organisationId: schema.bots.organisationId,
      })
      .from(schema.botKeys)
      .innerJoin(schema.bots, eq(schema.bots.id, schema.botKeys.botId))
      .where(and(isNull(schema.botKeys.revokedAt), isNull(schema.botKeys.expiryAuditedAt), lte(schema.botKeys.expiresAt, now)))
      .orderBy(asc(schema.botKeys.expiresAt))
      .limit(EXPIRY_SWEEP_BATCH_LIMIT);

    let audited = 0;
    for (const candidate of candidates) {
      try {
        const claimedAndAudited = await this.db.transaction(async tx => {
          if (!(await this.claimExpiredKey(tx, candidate.id))) return false;
          await this.auditExpiredKey(tx, candidate);
          return true;
        });
        if (claimedAndAudited) audited += 1;
      } catch (error) {
        this.logger.error('failed to audit expired bot key', { keyId: candidate.id, botId: candidate.botId.toString(), error });
      }
    }
    return audited;
  }

  private async remindOrganisation(organisationId: bigint, candidates: ExpiringKeyCandidate[]): Promise<number> {
    return this.db.transaction(async tx => {
      const claimed = await tx
        .update(schema.botKeys)
        .set({ expiryRemindedAt: new Date() })
        .where(
          and(
            inArray(
              schema.botKeys.id,
              candidates.map(candidate => candidate.id),
            ),
            isNull(schema.botKeys.revokedAt),
            isNull(schema.botKeys.expiryRemindedAt),
          ),
        )
        .returning({ id: schema.botKeys.id });
      if (claimed.length === 0) return 0;

      const claimedIds = new Set(claimed.map(row => row.id));
      const claimedKeys = candidates.filter(candidate => claimedIds.has(candidate.id));

      const recipients = await this.resolveNotifiableEmails(tx, organisationId);
      if (recipients.length === 0) {
        this.logger.warn('no owner/admin with a verified email to remind of expiring bot keys', { organisationId: organisationId.toString(), keyCount: claimedKeys.length });
        return 0;
      }

      const notifications: SendNotification[] = [];
      for (const key of claimedKeys) {
        for (const email of recipients) {
          notifications.push({
            templateKey: BOT_KEY_EXPIRING_TEMPLATE,
            recipients: { email },
            payload: { botHandle: key.botHandle, botDisplayName: key.botDisplayName, keyName: key.name, keyPrefix: key.keyPrefix, expiresAt: key.expiresAt.toISOString() },
          });
        }
      }
      await this.notificationService.enqueueMany(notifications, tx);
      return claimedKeys.length;
    });
  }

  private async resolveNotifiableEmails(executor: PrimaryTransaction, organisationId: bigint): Promise<string[]> {
    const members = await executor.query.organisationMembers.findMany({
      where: and(
        eq(schema.organisationMembers.organisationId, organisationId),
        inArray(schema.organisationMembers.role, NOTIFIABLE_ROLES),
        eq(schema.organisationMembers.status, 'ACTIVE'),
      ),
      columns: { userId: true },
    });
    if (members.length === 0) return [];

    const userIds = members.map(member => member.userId);
    const emails = await executor.query.userEmails.findMany({ where: and(inArray(schema.userEmails.userId, userIds), isNotNull(schema.userEmails.verifiedAt)) });

    const byUser = new Map<bigint, string>();
    for (const email of emails) {
      if (email.isPrimary || !byUser.has(email.userId)) byUser.set(email.userId, email.emailId);
    }
    return [...new Set(byUser.values())];
  }

  private async claimExpiredKey(tx: PrimaryTransaction, keyId: string): Promise<boolean> {
    const [claimed] = await tx
      .update(schema.botKeys)
      .set({ expiryAuditedAt: new Date() })
      .where(and(eq(schema.botKeys.id, keyId), isNull(schema.botKeys.revokedAt), isNull(schema.botKeys.expiryAuditedAt)))
      .returning({ id: schema.botKeys.id });
    return Boolean(claimed);
  }

  private async auditExpiredKey(tx: PrimaryTransaction, key: ExpiredKeyCandidate): Promise<void> {
    await this.auditService.record(
      {
        action: 'bot.key.expired',
        outcome: 'SUCCESS',
        actorType: 'SYSTEM',
        actorId: null,
        organisationId: key.organisationId.toString(),
        targetType: 'bot_key',
        targetId: key.id,
        detail: { botId: key.botId.toString(), name: key.name, keyPrefix: key.keyPrefix, expiresAt: key.expiresAt.toISOString() },
      },
      tx,
    );
  }
}
