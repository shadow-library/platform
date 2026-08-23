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
}

export type InsightPeriod = '30' | '90' | '365';

export interface InsightKpi {
  id: string;
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  positiveIs: 'up' | 'down' | 'neither';
  comparison: string;
  format?: Intl.NumberFormatOptions;
}

export interface Bar {
  id: string;
  label: string;
  value: number;
  caption: string;
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

export interface AiConsent {
  /** Quests, planning and money. */
  activity: boolean;
  /** Weight, sleep, steps, water and meals — a separate decision, revocable on its own (PRD §3.10). */
  health: boolean;
}

export type AiScope = 'activity' | 'money' | 'health' | 'everything';

export interface AiQuota {
  used: number;
  limit: number;
  planName: string;
  resetsOn: string;
  note: string;
}

export type AiRequestState = 'queued' | 'processing' | 'ready' | 'failed' | 'cancelled';

export interface AiRequest {
  id: string;
  question: string;
  scope: AiScope;
  state: AiRequestState;
  when: string;
  body: string;
}

export interface AiSuggestion {
  id: string;
  label: string;
  to: string;
}

export interface AiResult {
  id: string;
  title: string;
  meta: string;
  findings: { heading: string; body: string }[];
  suggestions: AiSuggestion[];
}

export interface AiHistoryEntry {
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
  | { type: 'ai.setConsent'; consent: AiConsent }
  | { type: 'ai.submit'; question: string; scope: AiScope }
  | { type: 'ai.cancel'; requestId: string }
  | { type: 'ai.retry'; requestId: string }
  | { type: 'ai.applySuggestion'; suggestionId: string }
  | { type: 'review.answer'; promptId: string; answer: string }
  | { type: 'review.complete' };
