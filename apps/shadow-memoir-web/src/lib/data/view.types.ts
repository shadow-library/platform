import { type OccurrenceState, type QuestOccurrence, type StatAffinity } from './quest.types';

export type Momentum = 'cold' | 'steady' | 'warm';

export type DayMode = 'new' | 'active' | 'recovery' | 'returner';

export type CrownCadence = 'daily' | 'weekly';

export interface CrownPeriod {
  label: string;
  cadence: CrownCadence;
  periodStart: string;
  closesOn: string;
  dayIndex: number;
  dayCount: number;
  /** Share of the period's crown still standing, 0–100; 100 when nothing was endowed. */
  keptPercent: number;
}

export interface HeroState {
  level: number;
  title: string;
  coins: number;
  xp: number;
  xpIntoLevel: number;
  /** 0 at the highest level; null when the account row does not carry the server's level curve. */
  xpForNextLevel: number | null;
  hp: number;
  hpMax: number;
  momentum: Momentum;
  crown: CrownPeriod;
}

interface RecoveryNotice {
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

interface DaySummary {
  headline: string;
  detail: string;
}

export interface DayView {
  date: string;
  mode: DayMode;
  hero: HeroState;
  hasActiveQuests: boolean;
  occurrences: QuestOccurrence[];
  recovery: RecoveryNotice | null;
  wakeWindowNote: string;
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
  /** Fill width, 0–100, on a scale that leaves headroom past the capacity mark so overload stays visible. */
  loadPercent: number;
  /** Position of the capacity tick on that same scale, 0–100. */
  capacityMarkPercent: number;
  overCapacity: boolean;
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

interface PlanCarryOver {
  title: string;
  body: string;
  questId: string;
}

export interface PlanView {
  label: string;
  from: string;
  to: string;
  days: PlanDay[];
  month: PlanMonthCell[];
  carryOver: PlanCarryOver | null;
  crown: CrownPeriod;
  /** The quest closest to its rolling seven-day reschedule cap; `questName` is null when nothing moved. */
  rescheduleBudget: { used: number; cap: number; questName: string | null };
  glance: string[];
}

interface LoadPreviewDay {
  label: string;
  minutes: number;
  percentOfCapacity: number;
}

export interface QuestDraftPreview {
  days: LoadPreviewDay[];
  /** How often an every-N-days draft lands in the coming week; `null` for drafts on fixed weekdays. */
  cadenceNote: string | null;
  overloadNote: string | null;
}

export interface CaptureTarget {
  occurrenceId: string;
  questId: string;
  questName: string;
  statAffinity: StatAffinity;
}
