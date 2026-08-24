/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { type SqlExecutor } from '@modules/auth';
import { occursOn, parseLocalDate, type RecurrenceRule } from '@modules/rules';
import { type Quest, schema } from '@server/database';

/**
 * Defining types
 */

export type LinkableModule = Extract<Quest.ModuleLink, 'journal' | 'meal' | 'weight'>;

export type LinkageStatus = 'offered' | 'already-completed';

export interface LinkageMatch {
  status: LinkageStatus;
  questId: bigint;
  questName: string;
  date: string;
}

/**
 * Declaring the constants
 */

const COMPLETED_STATES: readonly string[] = ['completed', 'partial', 'late'];

/**
 * PRD §2.6: a saved module entry that could satisfy an active, today-scheduled Quest with a matching
 * `module_link` either offers one-tap completion (nothing terminal there yet) or, if the Quest was
 * already completed today, reports that instead — both outcomes exist purely to suppress the quick-log's
 * own reward at the caller (no HeroLedger call for either case), never to write anything themselves. The
 * user's own `quest.complete` is what actually grants the Quest's reward — this never is.
 */
export async function findLinkageMatch(executor: SqlExecutor, accountId: bigint, module: LinkableModule, date: string): Promise<LinkageMatch | null> {
  const occurrenceDate = parseLocalDate(date);
  if (!occurrenceDate) return null;

  const quests = await executor
    .select()
    .from(schema.quests)
    .where(and(eq(schema.quests.accountId, accountId), eq(schema.quests.active, true), eq(schema.quests.moduleLink, module)));

  for (const quest of quests) {
    if (!occursOn(quest.recurrence as RecurrenceRule, occurrenceDate)) continue;

    const [log] = await executor
      .select({ state: schema.questLogs.state })
      .from(schema.questLogs)
      .where(and(eq(schema.questLogs.accountId, accountId), eq(schema.questLogs.questId, quest.id), eq(schema.questLogs.date, date)));

    const status: LinkageStatus = log && COMPLETED_STATES.includes(log.state) ? 'already-completed' : 'offered';
    return { status, questId: quest.id, questName: quest.name, date };
  }
  return null;
}

export function serializeLinkageMatch(match: LinkageMatch): Record<string, unknown> {
  return { status: match.status, questId: String(match.questId), questName: match.questName, date: match.date };
}
