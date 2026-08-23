export type LoggableModule = 'expenses' | 'journal' | 'meals' | 'weight' | 'sidequests';

export type EntryCapLevel = 'clear' | 'approaching' | 'reached';

export interface EntryCapAdvisory {
  module: LoggableModule;
  used: number;
  limit: number;
  ratio: number;
  level: EntryCapLevel;
  message: string | null;
  /** Structural, not incidental: PRD §4.13 makes the cap advisory, so no caller can read a blocking value here. */
  blocksSave: false;
}

export const MONTHLY_ENTRY_CAP = 100;

export const CAP_ADVISORY_THRESHOLD = 0.8;

const MODULE_NOUNS: Record<LoggableModule, string> = {
  expenses: 'expenses',
  journal: 'journal entries',
  meals: 'meals',
  weight: 'weight entries',
  sidequests: 'side quests',
};

export function deriveCapAdvisory(module: LoggableModule, used: number, limit: number = MONTHLY_ENTRY_CAP): EntryCapAdvisory {
  const ratio = limit > 0 ? used / limit : 0;
  const noun = MODULE_NOUNS[module];
  const level: EntryCapLevel = ratio >= 1 ? 'reached' : ratio >= CAP_ADVISORY_THRESHOLD ? 'approaching' : 'clear';
  const message =
    level === 'reached'
      ? `You have logged ${used} ${noun} this month, past the free monthly allowance of ${limit}. Everything still saves; a Memoir subscription lifts the count.`
      : level === 'approaching'
        ? `${used} of ${limit} ${noun} logged this month. Nothing changes at the limit — entries keep saving.`
        : null;
  return { module, used, limit, ratio, level, message, blocksSave: false };
}
