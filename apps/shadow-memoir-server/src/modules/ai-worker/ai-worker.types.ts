import { type AiConsent } from '@server/database';

/** The consent state read at claim time (ARCHITECTURE §15.3) and held for the whole execution, so a withdrawal mid-run can never widen what was already assembled. */
export type ConsentSnapshot = Record<AiConsent.DataClass, boolean>;

/**
 * The read-scope classes the audit row names (§15.5). They are coarser than tables on purpose: the row
 * records what kind of data was read and how much of it, never which rows and never any content.
 */
export type ReadDataClass =
  'quests' | 'quest_logs' | 'hero_events' | 'daily_states' | 'progression_events' | 'finance' | 'metrics' | 'meals' | 'side_quests' | 'journal_reflection_reason' | 'health';

export interface AssembledContext {
  profile: { timezone: string; intensityMode: string; tier: string; windowStart: string | null };
  quests: Record<string, unknown>[];
  questLogs: Record<string, unknown>[];
  heroEvents: Record<string, unknown>[];
  dailyStates: Record<string, unknown>[];
  progressionEvents: Record<string, unknown>[];
  finance: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
  meals: Record<string, unknown>[];
  sideQuests: Record<string, unknown>[];
  journal: Record<string, unknown>[];
  health: Record<string, unknown>[];
}

export interface ReadAssembly {
  context: AssembledContext;
  dataClasses: ReadDataClass[];
  rowCounts: Record<string, number>;
  /** Every most-sensitive free-text value handed to the model, kept only for the no-verbatim-quote check and never persisted. */
  sensitiveSources: string[];
  questIds: string[];
}

export interface DraftSuggestion {
  kind: string;
  questId: string;
  text: string;
}

/** The prompt contract's response shape (PRD §6.5), before the §6.6 post-filter has seen it. */
export interface InferenceDraft {
  answer: string;
  patterns: string[];
  suggestions: DraftSuggestion[];
  limitationNote: string | null;
}
