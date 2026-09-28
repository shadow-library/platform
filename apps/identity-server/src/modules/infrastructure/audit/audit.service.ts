import assert from 'node:assert';
import { createHash } from 'node:crypto';

import { and, asc, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { AuditEvent, DatabaseService, PrimaryDatabase, PrimaryTransaction, schema } from '@server/modules/infrastructure/datastore';
import { WebhookService } from '@server/modules/infrastructure/webhook';

export interface AuditInput {
  action: string;
  outcome: AuditEvent.Outcome;
  actorType: AuditEvent.ActorType;
  actorId?: string | null;
  organisationId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface ChainVerification {
  valid: boolean;
  brokenAt?: string;
}

const REDACTED_KEYS = new Set(['password', 'token', 'secret', 'code', 'hash', 'privatekey', 'authorization', 'cookie']);
const GLOBAL_CHAIN = 'global';

/**
 * Deterministic serialisation independent of key insertion order (jsonb does not preserve it) and
 * of Date representation, so a row's hash recomputes identically after a database round-trip.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

@Injectable()
export class AuditService {
  private readonly logger = Logger.getLogger(APP_NAME, AuditService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly webhookService: WebhookService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * `executor` lets a caller fold this write into a transaction it already holds open (e.g. a
   * claim it must roll back if the audit write fails) instead of opening a second, independent one.
   * Passing one moves `pg_advisory_xact_lock` into that transaction, held until the caller commits —
   * callers passing an executor MUST acquire their own row locks before calling `record()`. Taking a
   * row lock afterwards, while holding the advisory lock, can deadlock with another transaction
   * waiting on that same row: Postgres detects lock cycles through row locks, not through an
   * advisory lock held by a session waiting elsewhere, so the wait never resolves on its own.
   */
  async record(input: AuditInput, executor?: PrimaryTransaction): Promise<AuditEvent> {
    if (executor) return this.writeRecord(executor, input);
    return this.db.transaction(tx => this.writeRecord(tx, input));
  }

  private async writeRecord(tx: PrimaryTransaction, input: AuditInput): Promise<AuditEvent> {
    const organisationId = input.organisationId ?? null;
    const detail = this.redact(input.detail ?? undefined);

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${organisationId ?? GLOBAL_CHAIN}))`);
    const [tip] = await tx
      .select({ hash: schema.auditEvents.hash, chainPosition: schema.auditEvents.chainPosition })
      .from(schema.auditEvents)
      .where(and(sql`coalesce(${schema.auditEvents.organisationId}, '') = ${organisationId ?? ''}`, isNotNull(schema.auditEvents.chainPosition)))
      .orderBy(desc(schema.auditEvents.chainPosition))
      .limit(1);
    const prevHash = tip ? tip.hash : await this.legacyTipHash(tx, organisationId);
    const chainPosition = (tip?.chainPosition ?? 0n) + 1n;

    const record = {
      id: Bun.randomUUIDv7(),
      occurredAt: new Date(),
      organisationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      outcome: input.outcome,
      ipAddress: input.ipAddress ?? null,
      correlationId: input.correlationId ?? null,
      detail: detail ?? null,
    };
    const hash = this.computeHash(prevHash, record);
    const [inserted] = await tx
      .insert(schema.auditEvents)
      .values({ ...record, prevHash, hash, chainPosition })
      .returning();
    assert(inserted, 'Audit event insertion failed');
    await this.webhookService.fanOut(inserted, tx);
    return inserted;
  }

  /** Rows written before chain positions existed chained onto the largest id, so the first positioned row continues from the same tip. */
  private async legacyTipHash(tx: PrimaryTransaction, organisationId: string | null): Promise<string | null> {
    const [legacy] = await tx
      .select({ hash: schema.auditEvents.hash })
      .from(schema.auditEvents)
      .where(this.chainCondition(organisationId))
      .orderBy(desc(schema.auditEvents.id))
      .limit(1);
    return legacy?.hash ?? null;
  }

  async listForSubject(subjectId: string, limit = 50): Promise<AuditEvent[]> {
    return this.db
      .select()
      .from(schema.auditEvents)
      .where(or(eq(schema.auditEvents.actorId, subjectId), eq(schema.auditEvents.targetId, subjectId)))
      .orderBy(desc(schema.auditEvents.id))
      .limit(limit);
  }

  /**
   * Positioned rows must form one unbroken run from position 1, each linked to the one before it. Rows written before positions existed
   * were chained onto whichever predecessor held the largest UUIDv7 id, which forked under concurrent writes; they are never rewritten, so
   * each is held only to its own hash and to linking to a row of the same chain, with a single root. The first positioned row continues
   * from one of them, or is itself the root when a new writer began the chain and an old one extended it during a rollout.
   */
  async verifyChain(organisationId: string | null = null): Promise<ChainVerification> {
    const rows = await this.db
      .select()
      .from(schema.auditEvents)
      .where(this.chainCondition(organisationId))
      .orderBy(sql`${schema.auditEvents.chainPosition} ASC NULLS FIRST`, asc(schema.auditEvents.id));

    const legacy = rows.filter(row => row.chainPosition === null);
    const chainHashes = new Set(rows.map(row => row.hash));
    const legacyHashes = new Set(legacy.map(row => row.hash));
    const legacyRooted = legacy.some(row => row.prevHash === null);
    let roots = 0;
    for (const row of legacy) {
      if (row.prevHash === null) roots++;
      const linked = row.prevHash === null ? roots === 1 : chainHashes.has(row.prevHash);
      if (!linked || row.hash !== this.rehash(row)) return { valid: false, brokenAt: row.id };
    }

    let previous: AuditEvent | null = null;
    for (const row of rows.slice(legacy.length)) {
      const position = (previous?.chainPosition ?? 0n) + 1n;
      const anchored = row.prevHash === null ? !legacyRooted : legacyHashes.has(row.prevHash);
      const linked = previous ? row.prevHash === previous.hash : anchored;
      if (row.chainPosition !== position || !linked || row.hash !== this.rehash(row)) return { valid: false, brokenAt: row.id };
      previous = row;
    }
    return { valid: true };
  }

  private rehash(row: AuditEvent): string {
    return this.computeHash(row.prevHash, {
      id: row.id,
      occurredAt: row.occurredAt,
      organisationId: row.organisationId,
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      outcome: row.outcome,
      ipAddress: row.ipAddress,
      correlationId: row.correlationId,
      detail: row.detail ?? null,
    });
  }

  private chainCondition(organisationId: string | null) {
    return organisationId === null ? isNull(schema.auditEvents.organisationId) : eq(schema.auditEvents.organisationId, organisationId);
  }

  private computeHash(prevHash: string | null, record: Record<string, unknown>): string {
    return createHash('sha256')
      .update(prevHash ?? '')
      .update('\n')
      .update(stableStringify(record))
      .digest('hex');
  }

  private redact(detail?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!detail) return undefined;
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(detail)) {
      clean[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
    }
    return clean;
  }
}
