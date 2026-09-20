export type LoggableModule = 'expenses' | 'journal' | 'meals' | 'weight' | 'sidequests';

type EntryCapLevel = 'clear' | 'approaching' | 'reached';

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
  return { module, used, limit, ratio, level, message: capMessage(level, used, limit, noun), blocksSave: false };
}

function capMessage(level: EntryCapLevel, used: number, limit: number, noun: string): string | null {
  if (level === 'clear') return null;
  if (level === 'approaching') return `${used} of ${limit} ${noun} logged this month. Nothing changes at the limit — entries keep saving.`;
  const position = used === limit ? ' and reached' : ', past';
  return `You have logged ${used} ${noun} this month${position} the free monthly allowance of ${limit}. Everything still saves; a Memoir subscription lifts the count.`;
}

/** `unknown` is an entitlement not yet on this device: the allowance is a free-plan notice, so it waits until the plan is known rather than warning a paid owner. */
export type CapAdvisoryTier = 'free' | 'paid' | 'unknown';

export function capAdvisoryForTier(advisory: EntryCapAdvisory | undefined, tier: CapAdvisoryTier): EntryCapAdvisory | undefined {
  return tier === 'free' ? advisory : undefined;
}
