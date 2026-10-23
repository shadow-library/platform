import { Injectable } from '@shadow-library/app';

import { type Entitlement } from '@server/database';

import { AiReadRepository, type Rows } from './ai-read.repository';
import { type ExecutionAccount } from './ai-worker.repository';
import { type AssembledContext, type ConsentSnapshot, type ReadAssembly, type ReadDataClass } from './ai-worker.types';

export interface AssemblyRequest {
  account: ExecutionAccount;
  tier: Entitlement.Tier;
  consents: ConsentSnapshot;
  now: Date;
}

/** `jsonb` and `JSON.stringify` both refuse a bigint, and every id in this schema is one. */
function jsonSafe(rows: Rows): Record<string, unknown>[] {
  return rows.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (typeof value === 'bigint') return [key, String(value)];
        if (value instanceof Date) return [key, value.toISOString()];
        return [key, value];
      }),
    ),
  );
}

function collectText(rows: Rows, ...fields: string[]): string[] {
  const values: string[] = [];
  for (const row of rows) for (const field of fields) if (typeof row[field] === 'string' && row[field]) values.push(row[field] as string);
  return values;
}

function trailingWindowStart(now: Date, months: number): string {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - months);
  return start.toISOString().slice(0, 10);
}

/**
 * Consent gates reads and tier gates the window, both applied before a single row is fetched. What came back is reported as data-class names and row counts for `ai_task_audit`,
 * which has no field that could answer "which rows".
 */
@Injectable()
export class ReadAssemblyService {
  constructor(private readonly reads: AiReadRepository) {}

  async assemble(request: AssemblyRequest, windowStart: string | null): Promise<ReadAssembly> {
    const { account, consents } = request;
    const journal = consents.journal_reflection_reason;
    const health = consents.health;

    const [quests, questLogs, heroEvents, dailyStates, progressionEvents, finance, metrics, meals, sideQuests] = await Promise.all([
      this.reads.listQuests(account.id),
      this.reads.listQuestLogs(account.id, windowStart, journal),
      this.reads.listHeroEvents(account.id, windowStart),
      this.reads.listDailyStates(account.id, windowStart),
      this.reads.listProgressionEvents(account.id, windowStart, journal),
      this.reads.listFinance(account.id, windowStart),
      this.reads.listMetrics(account.id, windowStart, false),
      this.reads.listMeals(account.id, windowStart),
      this.reads.listSideQuests(account.id, windowStart),
    ]);

    const journalEntries = journal ? await this.reads.listJournal(account.id, windowStart) : [];
    const healthRows = health ? [...(await this.reads.listMetrics(account.id, windowStart, true)), ...(await this.reads.listWeights(account.id, windowStart))] : [];

    const context: AssembledContext = {
      profile: { timezone: account.timezone, intensityMode: account.intensityMode, tier: request.tier, windowStart },
      quests: jsonSafe(quests),
      questLogs: jsonSafe(questLogs),
      heroEvents: jsonSafe(heroEvents),
      dailyStates: jsonSafe(dailyStates),
      progressionEvents: jsonSafe(progressionEvents),
      finance: jsonSafe(finance),
      metrics: jsonSafe(metrics),
      meals: jsonSafe(meals),
      sideQuests: jsonSafe(sideQuests),
      journal: jsonSafe(journalEntries),
      health: jsonSafe(healthRows),
    };

    const counted: [ReadDataClass, Rows][] = [
      ['quests', quests],
      ['quest_logs', questLogs],
      ['hero_events', heroEvents],
      ['daily_states', dailyStates],
      ['progression_events', progressionEvents],
      ['finance', finance],
      ['metrics', metrics],
      ['meals', meals],
      ['side_quests', sideQuests],
      ['journal_reflection_reason', journalEntries],
      ['health', healthRows],
    ];
    const present = counted.filter(([, rows]) => rows.length > 0);

    return {
      context,
      dataClasses: present.map(([dataClass]) => dataClass),
      rowCounts: Object.fromEntries(present.map(([dataClass, rows]) => [dataClass, rows.length])),
      sensitiveSources: [...collectText(journalEntries, 'text'), ...collectText(questLogs, 'reasonNote', 'reflectionText'), ...collectText(progressionEvents, 'reflectionText')],
      questIds: quests.map(quest => String(quest['id'])),
    };
  }

  /** Free reads the trailing window, paid everything; a null start means no lower bound, the paid case. */
  windowStartFor(tier: Entitlement.Tier, now: Date, freeHistoryMonths: number): string | null {
    return tier === 'paid' ? null : trailingWindowStart(now, freeHistoryMonths);
  }
}
