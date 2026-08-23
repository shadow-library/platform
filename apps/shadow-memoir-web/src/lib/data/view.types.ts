import { type OccurrenceState, type QuestOccurrence, type StatAffinity } from './quest.types';

export type Momentum = 'cold' | 'steady' | 'warm';

export type DayMode = 'new' | 'active' | 'recovery';

export interface CrownPeriod {
  label: string;
  dayIndex: number;
  dayCount: number;
  keptPercent: number;
}

export interface HeroState {
  level: number;
  title: string;
  coins: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  hp: number;
  hpMax: number;
  momentum: Momentum;
  crown: CrownPeriod;
}

export interface RecoveryNotice {
  title: string;
  body: string;
}

export interface QuickLogTile {
  id: string;
  label: string;
  value: string;
  to: string;
}

export interface StreakBoardEntry {
  questId: string;
  questName: string;
  label: string;
  note: string | null;
  week: OccurrenceState[];
}

export interface UpcomingEntry {
  id: string;
  when: string;
  title: string;
  meta: string;
}

export interface ActivityEntry {
  id: string;
  text: string;
  when: string;
  rewarded: boolean;
}

export interface DaySummary {
  headline: string;
  detail: string;
}

export interface DayView {
  date: string;
  mode: DayMode;
  hero: HeroState;
  occurrences: QuestOccurrence[];
  recovery: RecoveryNotice | null;
  wakeWindowNote: string;
  quickLogs: QuickLogTile[];
  streaks: StreakBoardEntry[];
  upcoming: UpcomingEntry[];
  activity: ActivityEntry[];
  summary: DaySummary | null;
}

export interface PlanItem {
  occurrenceId: string;
  questId: string;
  title: string;
  meta: string;
  state: OccurrenceState;
  shielded: boolean;
}

export interface PlanDay {
  date: string;
  isToday: boolean;
  locked: boolean;
  loadPercent: number;
  loadSummary: string;
  items: PlanItem[];
  note: string | null;
}

export interface PlanMonthCell {
  date: string | null;
  inMonth: boolean;
  isToday: boolean;
  locked: boolean;
  note: string | null;
  outcomes: OccurrenceState[];
}

export interface PlanCarryOver {
  title: string;
  body: string;
}

export interface PlanView {
  label: string;
  from: string;
  to: string;
  days: PlanDay[];
  month: PlanMonthCell[];
  carryOver: PlanCarryOver | null;
  crown: CrownPeriod;
  rescheduleBudget: { used: number; cap: number; resetsOn: string };
  glance: string[];
}

export interface LoadPreviewDay {
  label: string;
  minutes: number;
  percentOfCapacity: number;
}

export interface QuestDraftPreview {
  days: LoadPreviewDay[];
  overloadNote: string | null;
}

export type MetricKind = 'steps' | 'calories' | 'sleep' | 'water';

export interface CaptureTarget {
  occurrenceId: string;
  questId: string;
  questName: string;
  statAffinity: StatAffinity;
}
