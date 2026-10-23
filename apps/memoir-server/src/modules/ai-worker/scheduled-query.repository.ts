import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase, schema } from '@server/database';

export interface ScheduledQueryRow {
  accountId: bigint;
  queryText: string;
}

/** The UUIDv5 namespace for scheduled-run task ids — a fixed constant, because changing it would re-materialize every account's standing query as a new task. */
const SCHEDULED_TASK_NAMESPACE = 'a5f0d5f2-7b3c-5e2a-9c1e-3f6b2d8c4a71';

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/**
 * RFC 4122 §4.3 name-based UUID: tonight's scheduled task id is derived rather than remembered, so two workers or a restart mid-sweep compute
 * the same id and the second insert conflicts away.
 */
export function scheduledTaskId(accountId: bigint, date: string): string {
  const digest = createHash('sha1').update(uuidBytes(SCHEDULED_TASK_NAMESPACE)).update(`${accountId}:${date}`).digest().subarray(0, 16);
  digest.writeUInt8((digest.readUInt8(6) & 0x0f) | 0x50, 6);
  digest.writeUInt8((digest.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Written like the user's own submission, but always with `quota_consumed = false`: a scheduled run never touches ad-hoc quota. */
@Injectable()
export class ScheduledQueryRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async listActive(): Promise<ScheduledQueryRow[]> {
    return this.db
      .select({ accountId: schema.aiScheduledQueries.accountId, queryText: schema.aiScheduledQueries.queryText })
      .from(schema.aiScheduledQueries)
      .where(eq(schema.aiScheduledQueries.active, true));
  }

  async materialize(id: string, accountId: bigint, queryText: string, expectedBy: Date): Promise<boolean> {
    const inserted = await this.db
      .insert(schema.aiTasks)
      .values({ id, accountId, queryText, kind: 'scheduled', expectedBy, quotaMonth: null, quotaConsumed: false })
      .onConflictDoNothing({ target: schema.aiTasks.id })
      .returning({ id: schema.aiTasks.id });
    return inserted.length > 0;
  }
}
