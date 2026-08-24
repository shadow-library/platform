/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type LoggableModule = 'journal' | 'meals' | 'weight' | 'sidequests';

export type EntryCapLevel = 'clear' | 'approaching' | 'reached';

export interface EntryCapAdvisory {
  module: LoggableModule;
  used: number;
  limit: number;
  ratio: number;
  level: EntryCapLevel;
  message: string | null;
  /** Structural, not incidental (PRD §4.13): the cap is advisory, so no caller can read a blocking value here. */
  blocksSave: false;
}

/**
 * Declaring the constants
 */

export const MONTHLY_ENTRY_CAP = 100;

export const CAP_ADVISORY_THRESHOLD = 0.8;

const MODULE_NOUNS: Record<LoggableModule, string> = {
  journal: 'journal entries',
  meals: 'meals',
  weight: 'weight entries',
  sidequests: 'side quests',
};

/**
 * The PRD §4.13 soft-cap read: 100 entries/module/calendar month, user-local, never blocking. `used`
 * counts every entry logged this month, the just-written one included, so the caller's own write always
 * shows up in its own advisory.
 */
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

export function serializeCapAdvisory(advisory: EntryCapAdvisory): Record<string, unknown> {
  return { module: advisory.module, used: advisory.used, limit: advisory.limit, ratio: advisory.ratio, level: advisory.level, message: advisory.message, blocksSave: false };
}
