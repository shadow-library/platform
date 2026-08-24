/**
 * Importing npm packages
 */
import { and, asc, eq, lt, notInArray, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type Account, type PrimaryDatabase, RolePoolService, schema } from '@server/database';

/**
 * Defining types
 */

export interface DeletionRemnant {
  accountId: bigint;
  identitySub: string;
  createdAt: Date;
  deletionStartedAt: Date | null;
}

export interface StalledDeletion {
  accountId: bigint;
  deletionState: Account.DeletionState;
}

/**
 * Declaring the constants
 */

/**
 * FK-safe relational purge order (ARCHITECTURE §21, step 4). Children precede parents, so a batch never
 * trips a referencing row. Seven FKs in this schema carry no `ON DELETE` action, which is what makes the
 * order load-bearing rather than cosmetic — `applied_suggestions` → `ai_results`/`quests`,
 * `ai_results`/`ai_task_audit` → `ai_tasks`, `expenses` → `subscriptions`, and
 * `metric_entries`/`quest_consequences` → `metrics`. The AI block leads because
 * `applied_suggestions.quest_id` is the longest backwards edge in the graph. `accounts` is deliberately
 * absent: the state machine lives on that row and step 6 removes it. `fx_rates` is absent because it is
 * global reference data with no `account_id`, owned by nobody.
 */
const PURGE_ORDER = [
  'applied_suggestions',
  'ai_task_audit',
  'ai_results',
  'ai_tasks',
  'ai_scheduled_queries',
  'ai_consents',
  'quest_logs',
  'quest_streaks',
  'reschedule_events',
  'shield_consumptions',
  'recovery_quests',
  'quest_consequences',
  'comeback_events',
  'returner_events',
  'daily_states',
  'hero_events',
  'command_log',
  'deleted_records',
  'devices',
  'quests',
  'metric_entries',
  'metrics',
  'expenses',
  'subscriptions',
  'expense_categories',
  'receipts',
  'journal_entries',
  'meals',
  'meal_presets',
  'weights',
  'side_quests',
  'achievements_earned',
  'titles_earned',
  'cosmetic_unlocks',
  'progress_counters',
  'entitlements',
  'billing_events',
  'export_jobs',
  'notification_outbox',
] as const;

const TERMINAL_STATES: Account.DeletionState[] = ['none', 'done'];

@Injectable()
export class DeletionRepository {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly rolePools: RolePoolService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async findState(accountId: bigint): Promise<Account.DeletionState | null> {
    const [row] = await this.db.select({ state: schema.accounts.deletionState }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return row?.state ?? null;
  }

  async findIdentitySub(accountId: bigint): Promise<string | null> {
    const [row] = await this.db.select({ identitySub: schema.accounts.identitySub }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return row?.identitySub ?? null;
  }

  /** The durable marker (step 2), guarded on `none` so a second start request moves nothing and reads back the state already in flight. */
  async markPending(accountId: bigint): Promise<boolean> {
    const rows = await this.db
      .update(schema.accounts)
      .set({ deletionState: 'pending', deletionStartedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.deletionState, 'none')))
      .returning({ id: schema.accounts.id });
    return rows.length > 0;
  }

  /** One guarded transition: zero rows means someone else already advanced this account, and the caller re-reads rather than repeating the step. */
  async advance(accountId: bigint, from: Account.DeletionState, to: Account.DeletionState): Promise<boolean> {
    const rows = await this.db
      .update(schema.accounts)
      .set({ deletionState: to, updatedAt: new Date() })
      .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.deletionState, from)))
      .returning({ id: schema.accounts.id });
    return rows.length > 0;
  }

  /**
   * Step 4, as `memoir_deleter` — the one role holding DELETE on the §10.4 append-only tables, so the
   * "no runtime path mutates history" guarantee survives this. Each table drains in `ctid`-bounded
   * batches; a pass that hits `maxBatches` returns short and the sweep resumes it, which is what keeps
   * a very large account from holding one connection for minutes.
   */
  async purge(accountId: bigint, batchSize: number, maxBatches: number): Promise<number> {
    const db = this.rolePools.getPool('memoir_deleter');
    let deleted = 0;
    let batches = 0;

    for (const table of PURGE_ORDER) {
      for (;;) {
        if (batches >= maxBatches) return deleted;
        const rows = await db.execute(
          sql`DELETE FROM ${sql.raw(table)} WHERE ctid = ANY (ARRAY(SELECT ctid FROM ${sql.raw(table)} WHERE account_id = ${accountId} LIMIT ${batchSize})) RETURNING 1 AS deleted`,
        );
        batches++;
        deleted += rows.length;
        if (rows.length < batchSize) break;
      }
    }

    return deleted;
  }

  /** Whether any row the purge is responsible for still exists — the re-entry check that makes step 4 idempotent without re-running every table. */
  async hasResidualRows(accountId: bigint): Promise<boolean> {
    const db = this.rolePools.getPool('memoir_deleter');
    for (const table of PURGE_ORDER) {
      const rows = await db.execute(sql`SELECT 1 AS present FROM ${sql.raw(table)} WHERE account_id = ${accountId} LIMIT 1`);
      if (rows.length > 0) return true;
    }
    return false;
  }

  /**
   * Step 6, as a single guarded DELETE rather than an UPDATE-then-DELETE pair: `memoir_deleter` holds
   * no UPDATE grant on `accounts`, and splitting the two across pools would leave a window where the
   * row reads `done` but still exists with nothing left to re-drive it. Row absence *is* the `done`
   * state; a re-entry that finds no row treats the machine as finished.
   */
  async removeAccount(accountId: bigint): Promise<DeletionRemnant | null> {
    const db = this.rolePools.getPool('memoir_deleter');
    const rows = await db.execute<{ id: string; identity_sub: string; created_at: Date; deletion_started_at: Date | null }>(
      sql`DELETE FROM accounts WHERE id = ${accountId} AND deletion_state = 'identity_closed' RETURNING id, identity_sub, created_at, deletion_started_at`,
    );
    const row = rows[0];
    if (!row) return null;
    return { accountId: BigInt(row.id), identitySub: row.identity_sub, createdAt: row.created_at, deletionStartedAt: row.deletion_started_at };
  }

  /** Accounts parked in a non-terminal state since before `staleBefore` — the resumption sweep's work queue (§21, step 3–6 crash resumability). */
  async findStalled(staleBefore: Date, limit: number): Promise<StalledDeletion[]> {
    const rows = await this.db
      .select({ accountId: schema.accounts.id, deletionState: schema.accounts.deletionState })
      .from(schema.accounts)
      .where(and(notInArray(schema.accounts.deletionState, TERMINAL_STATES), lt(schema.accounts.deletionStartedAt, staleBefore)))
      .orderBy(asc(schema.accounts.id))
      .limit(limit);
    return rows;
  }
}
