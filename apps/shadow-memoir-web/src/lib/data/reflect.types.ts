export type HistoryKind = 'quest' | 'hero' | 'expense' | 'journal' | 'meal' | 'weight' | 'health' | 'side-quest' | 'recovery';

export type HistoryFilter = HistoryKind | 'all';

export interface HistoryRow {
  id: string;
  time: string;
  kind: HistoryKind;
  text: string;
  value: string;
  queued: boolean;
}

export interface HistoryGroup {
  date: string;
  label: string;
  rows: HistoryRow[];
}

export interface HistoryDetail {
  id: string;
  kind: HistoryKind;
  title: string;
  when: string;
  section: string;
  to: string;
  fields: { label: string; value: string }[];
}

export interface HistoryView {
  countLabel: string;
  groups: HistoryGroup[];
  totals: string[];
  pageCount: number;
  /** Every matched record's id, across every page — lets a screen tell a filtered-out selection from a missing one. */
  matchedIds: Set<string>;
  matchedCount: number;
  /** Unfiltered — 0 only for a genuinely empty account, unlike a filter that matches nothing. */
  totalRecords: number;
}

export type InsightPeriod = '30' | '90' | '365';

export interface InsightKpi {
  id: string;
  label: string;
  /** `null` when the period holds nothing to rate — rendered as an unavailable tile, never a misleading zero. */
  value: number | null;
  unit?: string;
  delta?: number;
  positiveIs: 'up' | 'down' | 'neither';
  /** The final, ready-to-render caption sentence — the screen prints it as-is. */
  caption: string;
  format?: Intl.NumberFormatOptions;
  /** The full-precision value behind a compacted display, for a `title` tooltip. */
  exactValue?: string;
}

export interface Bar {
  id: string;
  label: string;
  value: number;
  caption: string;
  /** The full accessible sentence ("Monday: 76% kept") — the chart's own `aria-label`, never assembled from `label`/`caption` at render time. */
  ariaLabel: string;
  /** `false` for a bucket with nothing logged in it — distinct from a real `value` of 0. */
  hasEntries: boolean;
}

export interface TrendSeries {
  id: string;
  name: string;
  value: string;
  points: number[];
}

export interface InsightsView {
  periodNote: string;
  kpis: InsightKpi[];
  adherenceByQuest: Bar[];
  adherenceByWeekday: Bar[];
  weekdayNote: string;
  xpByMonth: Bar[];
  xpNote: string;
  reasons: Bar[];
  reasonsNote: string;
  spend: Bar[];
  spendNote: string;
  trends: TrendSeries[];
}

export type ReviewStepId = 'kept' | 'money' | 'body' | 'reflect' | 'done';

export interface ReviewQuestRow {
  id: string;
  title: string;
  result: string;
  days: ('kept' | 'partial' | 'missed' | 'none')[];
}

export interface ReviewFact {
  label: string;
  value: number;
  unit?: string;
  comparison: string;
  format?: Intl.NumberFormatOptions;
}

export interface ReviewPrompt {
  id: string;
  question: string;
  placeholder: string;
  answer: string;
}

export interface ReviewView {
  weekLabel: string;
  keptHeadline: string;
  quests: ReviewQuestRow[];
  keptPattern: string;
  moneyHeadline: string;
  moneyFacts: ReviewFact[];
  moneyNote: string;
  bodyHeadline: string;
  bodyFacts: ReviewFact[];
  /** Present when a metric had too few entries to summarise — the section stays empty rather than guessing. */
  bodyGap: { title: string; body: string } | null;
  prompts: ReviewPrompt[];
  completion: { title: string; body: string; lines: string[] } | null;
  glance: string[];
  carried: string;
}

interface AiConsentGrants {
  /** Reflection text and the reasons attached to a miss (PRD §6.7). */
  journal: boolean;
  /** Weight, sleep, steps, water and meals — a separate decision, revocable on its own (PRD §3.10). */
  health: boolean;
}

export interface AiConsent extends AiConsentGrants {
  /** False until either class has ever been decided, which is what puts a first-time owner in front of the gate. */
  decided: boolean;
}

interface AiQuota {
  used: number;
  /** Null on a paid plan: the allowance is a daily soft cap the server holds, not a monthly count the client can render. */
  limit: number | null;
  planName: string;
  resetsOn: string;
  note: string;
}

export type AiRequestState = 'queued' | 'processing' | 'ready' | 'failed' | 'cancelled' | 'held';

export interface AiRequest {
  id: string;
  question: string;
  state: AiRequestState;
  when: string;
  body: string;
}

export interface AiSuggestion {
  id: string;
  index: number;
  label: string;
  /** The quest the offer names; applying records the offer and opens it, and the owner's own edit is what changes anything. */
  to: string;
}

export interface AiResult {
  id: string;
  title: string;
  meta: string;
  findings: { heading: string; body: string }[];
  suggestions: AiSuggestion[];
  limitationNote: string | null;
}

interface AiHistoryEntry {
  id: string;
  state: AiRequestState;
  title: string;
  when: string;
}

export interface CoachView {
  consent: AiConsent;
  quota: AiQuota;
  active: AiRequest | null;
  latest: AiResult | null;
  history: AiHistoryEntry[];
}

export type ReflectCommand =
  | { type: 'ai.setConsent'; consent: AiConsentGrants }
  | { type: 'ai.submit'; question: string }
  | { type: 'ai.cancel'; requestId: string }
  | { type: 'ai.retry'; requestId: string }
  | { type: 'ai.applySuggestion'; resultId: string; suggestionIndex: number }
  | { type: 'review.answer'; promptId: string; answer: string }
  | { type: 'review.complete' };
