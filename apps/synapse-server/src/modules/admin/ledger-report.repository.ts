import { and, type AnyColumn, asc, desc, eq, gte, lt, ne, not, or, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase, schema } from '@server/database';

import { type SeriesGroup, type UsageGroup } from './admin.constants';
import { type BudgetWindow, type TokenTotals } from '@modules/catalog';
import { belowBudgetLimits, type BudgetCounterKey, budgetCounterMatches, type BudgetCounterReading, type BudgetLimits } from '@modules/metering';

export interface UsageRow extends TokenTotals {
  key: string | null;
  calls: number;
  reasoningTokens: number;
  listCostUsd: number;
  billedCostUsd: number;
}

export interface UsageFilter {
  app?: string;
  task?: string;
}

export interface SeriesRow extends UsageRow {
  day: string;
}

export interface AliasUsageRow extends TokenTotals {
  app: string;
  task: string;
  calls: number;
}

export interface ProviderOutcomeRow {
  provider: string;
  calls: number;
  errors: number;
}

export interface SubjectCounterRow extends BudgetCounterReading {
  subjectType: string;
  subjectId: string;
}

export interface SubjectCountersQuery {
  app: string;
  window: BudgetWindow;
  windowStart: Date;
  limits: BudgetLimits;
  top: number;
  /** A row that is not a subject's own, such as a per-app budget's counter sharing this window */
  excluding?: BudgetCounterKey;
}

export interface SubjectCountersSummary {
  activeSubjects: number;
  atLimit: number;
  top: SubjectCounterRow[];
}

const ledger = schema.ledger;
const counters = schema.budgetCounters;

const GROUP_EXPRESSIONS = {
  app: sql`${ledger.app}`,
  task: sql`${ledger.task}`,
  alias: sql`${ledger.alias}`,
  model: sql`${ledger.model}`,
  provider: sql`${ledger.provider}`,
  day: sql`to_char(${ledger.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
} satisfies Record<UsageGroup, unknown>;

const SETTLED = ne(ledger.status, 'pending');

/** Sums are cast to float8 because the driver hands back bigint and numeric sums as strings. */
const total = (column: AnyColumn): ReturnType<typeof sql<number>> => sql<number>`coalesce(sum(${column}), 0)::float8`;

const USAGE_COLUMNS = {
  calls: sql<number>`count(*)::int`,
  inputTokens: total(ledger.inputTokens),
  cachedInputTokens: total(ledger.cachedInputTokens),
  outputTokens: total(ledger.outputTokens),
  reasoningTokens: total(ledger.reasoningTokens),
  listCostUsd: total(ledger.listCostUsd),
  billedCostUsd: total(ledger.billedCostUsd),
};

function filterConditions(filter: UsageFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.app !== undefined) conditions.push(eq(ledger.app, filter.app));
  if (filter.task !== undefined) conditions.push(eq(ledger.task, filter.task));
  return conditions;
}

@Injectable()
export class LedgerReportRepository {
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  usage(group: UsageGroup, from: Date, to: Date, filter: UsageFilter = {}): Promise<UsageRow[]> {
    const key = GROUP_EXPRESSIONS[group];
    const order = group === 'day' ? [asc(sql`key`)] : [desc(total(ledger.listCostUsd)), asc(sql`key`)];
    return this.databaseService.run(() =>
      this.db
        .select({
          key: sql<string | null>`${key}`.as('key'),
          ...USAGE_COLUMNS,
        })
        .from(ledger)
        .where(and(gte(ledger.createdAt, from), lt(ledger.createdAt, to), SETTLED, ...filterConditions(filter)))
        .groupBy(sql`key`)
        .orderBy(...order),
    );
  }

  usageSeries(group: SeriesGroup, from: Date, to: Date, filter: UsageFilter = {}): Promise<SeriesRow[]> {
    return this.databaseService.run(() =>
      this.db
        .select({
          key: sql<string | null>`${GROUP_EXPRESSIONS[group]}`.as('key'),
          day: sql<string>`${GROUP_EXPRESSIONS.day}`.as('day'),
          ...USAGE_COLUMNS,
        })
        .from(ledger)
        .where(and(gte(ledger.createdAt, from), lt(ledger.createdAt, to), SETTLED, ...filterConditions(filter)))
        .groupBy(sql`key`, sql`day`)
        .orderBy(asc(sql`day`), asc(sql`key`)),
    );
  }

  aliasUsage(alias: string, since: Date): Promise<AliasUsageRow[]> {
    return this.databaseService.run(() =>
      this.db
        .select({
          app: ledger.app,
          task: ledger.task,
          calls: sql<number>`count(*)::int`,
          inputTokens: total(ledger.inputTokens),
          cachedInputTokens: total(ledger.cachedInputTokens),
          outputTokens: total(ledger.outputTokens),
        })
        .from(ledger)
        .where(and(eq(ledger.alias, alias), gte(ledger.createdAt, since), SETTLED))
        .groupBy(ledger.app, ledger.task)
        .orderBy(asc(ledger.app), asc(ledger.task)),
    );
  }

  /** Only calls that reached a provider count: a refused request never left, and a cancelled one says nothing about the provider's health. */
  providerOutcomes(since: Date): Promise<ProviderOutcomeRow[]> {
    return this.databaseService.run(() =>
      this.db
        .select({
          provider: sql<string>`${ledger.provider}`,
          calls: sql<number>`count(*)::int`,
          errors: sql<number>`(count(*) filter (where ${ledger.status} = 'error'))::int`,
        })
        .from(ledger)
        .where(and(gte(ledger.createdAt, since), sql`${ledger.provider} is not null`, sql`${ledger.status} in ('ok', 'error')`))
        .groupBy(ledger.provider),
    );
  }

  budgetCounter(key: BudgetCounterKey): Promise<BudgetCounterReading | undefined> {
    return this.databaseService.run(async () => {
      const [row] = await this.db.select({ calls: counters.calls, listCostUsd: counters.listCostUsd }).from(counters).where(budgetCounterMatches(key));
      return row;
    });
  }

  /** The totals are window aggregates, computed over every matching row before the limit cuts the list to the top rows */
  subjectCounters(query: SubjectCountersQuery): Promise<SubjectCountersSummary> {
    const below = belowBudgetLimits(query.limits);
    const atLimit = below ? not(below) : sql`false`;
    const excluded = query.excluding && or(ne(counters.subjectType, query.excluding.subjectType), ne(counters.subjectId, query.excluding.subjectId));
    return this.databaseService.run(async () => {
      const rows = await this.db
        .select({
          subjectType: counters.subjectType,
          subjectId: counters.subjectId,
          calls: counters.calls,
          listCostUsd: counters.listCostUsd,
          activeSubjects: sql<number>`(count(*) over ())::int`,
          atLimit: sql<number>`(count(*) filter (where ${atLimit}) over ())::int`,
        })
        .from(counters)
        .where(and(eq(counters.app, query.app), eq(counters.window, query.window), eq(counters.windowStart, query.windowStart), excluded))
        .orderBy(desc(counters.listCostUsd), desc(counters.calls), asc(counters.subjectType), asc(counters.subjectId))
        .limit(query.top);
      const [first] = rows;
      return {
        activeSubjects: first?.activeSubjects ?? 0,
        atLimit: first?.atLimit ?? 0,
        top: rows.map(({ subjectType, subjectId, calls, listCostUsd }) => ({ subjectType, subjectId, calls, listCostUsd })),
      };
    });
  }
}
