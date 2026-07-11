/**
 * Importing npm packages
 */
import assert from 'node:assert';
import { createHash } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { asc, desc, eq, isNull, or, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { AuditEvent, DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

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

/**
 * Declaring the constants
 *
 * Keys whose values must never be written into the audit detail, even if a caller passes them.
 */
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

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Appends an event to its organisation's hash chain. A per-chain transaction advisory lock
   * serialises concurrent writers so the chain cannot fork; the hash binds the canonical row to
   * its predecessor, making any later tampering detectable.
   */
  async record(input: AuditInput): Promise<AuditEvent> {
    const chainKey = input.organisationId ?? GLOBAL_CHAIN;
    const id = Bun.randomUUIDv7();
    const occurredAt = new Date();
    const detail = this.redact(input.detail ?? undefined);

    return this.db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${chainKey}))`);
      const [previous] = await tx
        .select({ hash: schema.auditEvents.hash })
        .from(schema.auditEvents)
        .where(this.chainCondition(input.organisationId ?? null))
        .orderBy(sql`${schema.auditEvents.id} DESC`)
        .limit(1);
      const prevHash = previous?.hash ?? null;

      const record = {
        id,
        occurredAt,
        organisationId: input.organisationId ?? null,
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
        .values({ ...record, prevHash, hash })
        .returning();
      assert(inserted, 'Audit event insertion failed');
      return inserted;
    });
  }

  /** Most-recent-first trail of events a subject performed or was the target of (admin views). */
  async listForSubject(subjectId: string, limit = 50): Promise<AuditEvent[]> {
    return this.db
      .select()
      .from(schema.auditEvents)
      .where(or(eq(schema.auditEvents.actorId, subjectId), eq(schema.auditEvents.targetId, subjectId)))
      .orderBy(desc(schema.auditEvents.id))
      .limit(limit);
  }

  /** Recomputes every hash in a chain and reports the first row that fails to match. */
  async verifyChain(organisationId: string | null = null): Promise<{ valid: boolean; brokenAt?: string }> {
    const rows = await this.db.select().from(schema.auditEvents).where(this.chainCondition(organisationId)).orderBy(asc(schema.auditEvents.id));
    let prevHash: string | null = null;
    for (const row of rows) {
      const expected = this.computeHash(prevHash, {
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
      if (row.prevHash !== prevHash || row.hash !== expected) return { valid: false, brokenAt: row.id };
      prevHash = row.hash;
    }
    return { valid: true };
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
