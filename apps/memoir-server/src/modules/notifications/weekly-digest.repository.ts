import { and, between, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase, schema } from '@server/database';

export interface DigestAccount {
  id: bigint;
  timezone: string;
  defaultCurrency: string;
}

export interface WeekQuestLog {
  state: string;
  reasonTag: string | null;
}

/**
 * The weekly review email's read side: every query is aggregate-shaped (`quest_logs.state`/`reason_tag`, never `reason_note`; `sum()` over `expenses`' minor-unit columns);
 * `metrics`/`metric_entries` and free-text columns are never selected.
 */
@Injectable()
export class WeeklyDigestRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async eligibleAccounts(): Promise<DigestAccount[]> {
    return this.db
      .select({ id: schema.accounts.id, timezone: schema.accounts.timezone, defaultCurrency: schema.accounts.defaultCurrency })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.deletionState, 'none'), sql`${schema.accounts.notificationPrefs} ->> 'weeklyDigest' = 'true'`));
  }

  async questLogsForWeek(accountId: bigint, weekStartDate: string, weekEndDate: string): Promise<WeekQuestLog[]> {
    return this.db
      .select({ state: schema.questLogs.state, reasonTag: schema.questLogs.reasonTag })
      .from(schema.questLogs)
      .where(and(eq(schema.questLogs.accountId, accountId), between(schema.questLogs.date, weekStartDate, weekEndDate)));
  }

  async netExpenseMinorForWeek(accountId: bigint, weekStartDate: string, weekEndDate: string): Promise<bigint> {
    const [row] = await this.db
      .select({ netMinor: sql<string>`coalesce(sum(coalesce(${schema.expenses.homeAmountMinor}, ${schema.expenses.amountMinor})), 0)` })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.accountId, accountId), between(schema.expenses.occurredOn, weekStartDate, weekEndDate)));
    return BigInt(row?.netMinor ?? '0');
  }
}
