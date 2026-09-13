import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { ValidationError } from '@shadow-library/common';

import { ERROR_MESSAGES, isNumericId } from '@server/constants';
import { type AuditEvent, DatabaseService, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { findBot } from './bot-lookup.util';
import { resolveUserRefs } from './bot-user-ref.util';
import { type BotAuditAction } from './bot.constants';
import { type BotUserRef } from './bot.types';

export interface BotActivityFilter {
  limit: number;
  cursor?: string;
  action?: BotAuditAction;
  outcome?: AuditEvent.Outcome;
}

export interface BotActivityDetail {
  reason?: string;
  purpose?: string;
  fields?: string[];
  added?: string[];
  removed?: string[];
}

export interface BotActivityEvent {
  id: string;
  occurredAt: Date;
  action: string;
  outcome: AuditEvent.Outcome;
  actorType: AuditEvent.ActorType;
  actor: BotUserRef | null;
  keyId: string | null;
  keyName: string | null;
  ip: string | null;
  detail: BotActivityDetail | null;
}

export interface BotActivityPage {
  events: BotActivityEvent[];
  nextCursor: string | null;
}

interface GrantDetail {
  application?: unknown;
  resource?: unknown;
  level?: unknown;
}

const CURSOR_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const encodeCursor = (event: { id: string }): string => Buffer.from(event.id, 'utf8').toString('base64url');

function decodeCursor(value: string): string {
  const id = Buffer.from(value, 'base64url').toString('utf8');
  if (!CURSOR_PATTERN.test(id)) throw new ValidationError('cursor', ERROR_MESSAGES.INVALID_CURSOR);
  return id;
}

const stringsOf = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined);

const grantLabels = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map(entry => {
    const grant = entry as GrantDetail;
    const parts = [grant.application, grant.resource, grant.level].filter((part): part is string => typeof part === 'string');
    return parts.join(':');
  });
};

@Injectable()
export class BotActivityService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * A bot's own events target the bot; exchange and key events target the key, so both target sets are
   * unioned. `id` alone is the sort and the cursor: it is a UUIDv7 minted from the same timestamp that sets
   * `occurred_at`, so it orders chronologically, is unique, and rides the `(organisation_id, id)` index a
   * composite `occurred_at` sort would miss.
   */
  async listActivity(organisationId: bigint, botId: bigint, query: BotActivityFilter): Promise<BotActivityPage> {
    const bot = await findBot(this.db, organisationId, botId);
    const keys = await this.db.query.botKeys.findMany({ where: eq(schema.botKeys.botId, bot.id), columns: { id: true, name: true } });
    const keyNames = new Map(keys.map(key => [key.id, key.name]));

    const targets = [and(eq(schema.auditEvents.targetType, 'bot'), eq(schema.auditEvents.targetId, bot.id.toString()))];
    if (keys.length > 0)
      targets.push(
        and(
          eq(schema.auditEvents.targetType, 'bot_key'),
          inArray(
            schema.auditEvents.targetId,
            keys.map(key => key.id),
          ),
        ),
      );

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const conditions = [
      eq(schema.auditEvents.organisationId, organisationId.toString()),
      or(...targets),
      query.action ? eq(schema.auditEvents.action, query.action) : undefined,
      query.outcome ? eq(schema.auditEvents.outcome, query.outcome) : undefined,
      cursor ? lt(schema.auditEvents.id, cursor) : undefined,
    ];

    const rows = await this.db
      .select()
      .from(schema.auditEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.auditEvents.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const actorRef = await resolveUserRefs(
      this.db,
      page.map(row => (row.actorType === 'USER' && row.actorId !== null && isNumericId(row.actorId) ? BigInt(row.actorId) : null)),
    );

    return {
      events: page.map(row => this.toEvent(row, keyNames, actorRef)),
      nextCursor: rows.length > query.limit ? encodeCursor(page[page.length - 1] as AuditEvent) : null,
    };
  }

  private toEvent(row: AuditEvent, keyNames: Map<string, string>, actorRef: (id: bigint | null) => BotUserRef | null): BotActivityEvent {
    const detail = row.detail ?? {};
    const keyId = row.targetType === 'bot_key' ? row.targetId : typeof detail.keyId === 'string' ? detail.keyId : null;
    const activityDetail: BotActivityDetail = {
      reason: typeof detail.reason === 'string' ? detail.reason : undefined,
      purpose: typeof detail.purpose === 'string' ? detail.purpose : undefined,
      fields: stringsOf(detail.fields),
      added: grantLabels(detail.added),
      removed: grantLabels(detail.removed),
    };

    return {
      id: row.id,
      occurredAt: row.occurredAt,
      action: row.action,
      outcome: row.outcome,
      actorType: row.actorType,
      actor: actorRef(row.actorType === 'USER' && row.actorId !== null && isNumericId(row.actorId) ? BigInt(row.actorId) : null),
      keyId,
      keyName: (keyId !== null ? keyNames.get(keyId) : undefined) ?? (typeof detail.name === 'string' ? detail.name : null),
      ip: row.ipAddress,
      detail: Object.values(activityDetail).some(value => value !== undefined) ? activityDetail : null,
    };
  }
}
