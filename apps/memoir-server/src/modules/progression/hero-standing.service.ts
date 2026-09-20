/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import {
  type CrownCadence,
  crownCadenceFor,
  type CrownPeriod,
  crownPeriodOf,
  currentRuleset,
  daysBetween,
  formatLocalDate,
  type LocalDate,
  localDateAt,
  type Ruleset,
  streakApplies,
  xpThresholdForLevel,
  xpToAdvance,
} from '@modules/rules';
import { type Account, type DailyState } from '@server/database';

import { HeroStandingRepository, type ShieldHolder } from './hero-standing.repository';

/**
 * Defining types
 */

export type HeroPersona = 'active' | 'returner' | 'recovery';

export interface CrownWindow {
  label: string;
  cadence: CrownCadence;
  periodStart: string;
  closesOn: string;
  dayIndex: number;
  dayCount: number;
  keptPercent: number;
}

export interface ComebackStanding {
  armed: boolean;
  firedOn: string | null;
}

export interface HeroStanding {
  xpIntoLevel: number;
  xpForNextLevel: number;
  shieldsAvailable: number;
  shieldCap: number;
  crown: CrownWindow;
  persona: HeroPersona;
  comeback: ComebackStanding | null;
}

/**
 * Declaring the constants
 */

const CROWN_LABELS: Record<CrownCadence, string> = { daily: 'today', weekly: 'this week' };

function levelProgress(ruleset: Ruleset, account: Account.Row): Pick<HeroStanding, 'xpIntoLevel' | 'xpForNextLevel'> {
  return { xpIntoLevel: Math.max(0, Number(account.totalXp) - xpThresholdForLevel(ruleset, account.level)), xpForNextLevel: xpToAdvance(ruleset, account.level) };
}

/** A quest outside streak eligibility can still hold a Returner gift, so it counts toward the cap only while it does. */
function shieldStanding(ruleset: Ruleset, holders: ShieldHolder[]): Pick<HeroStanding, 'shieldsAvailable' | 'shieldCap'> {
  const counted = holders.filter(holder => holder.shieldsAvailable > 0 || streakApplies(ruleset, holder.strictness, holder.optionalStreakOptIn));
  return { shieldsAvailable: counted.reduce((total, holder) => total + holder.shieldsAvailable, 0), shieldCap: counted.length * ruleset.shields.capPerQuest };
}

function crownWindow(period: CrownPeriod, today: LocalDate, days: DailyState.Row[]): CrownWindow {
  const periodStart = formatLocalDate(period.start);
  const inPeriod = days.filter(day => day.crownPeriodStart === periodStart);
  const granted = inPeriod.reduce((total, day) => total + day.crownXpGranted, 0);
  const remaining = inPeriod.reduce((total, day) => total + day.crownXpRemaining, 0);

  return {
    label: CROWN_LABELS[period.cadence],
    cadence: period.cadence,
    periodStart,
    closesOn: formatLocalDate(period.closesOn),
    dayIndex: daysBetween(period.start, today) + 1,
    dayCount: daysBetween(period.start, period.closesOn) + 1,
    keptPercent: granted === 0 ? 100 : Math.round((remaining / granted) * 100),
  };
}

/** The Returner ritual frames the whole day (PRD §4.10 suppresses Comeback under it), so it outranks a Recovery that the same return spawned. */
function personaFor(today: DailyState.Row | undefined, recoveryPending: boolean): HeroPersona {
  if (today?.returnerActive) return 'returner';
  return recoveryPending ? 'recovery' : 'active';
}

function comebackFor(today: DailyState.Row | undefined): ComebackStanding | null {
  if (!today || (!today.comebackArmed && !today.comebackFired)) return null;
  return { armed: today.comebackArmed, firedOn: today.comebackFired ? today.date : null };
}

@Injectable()
export class HeroStandingService {
  constructor(private readonly repository: HeroStandingRepository) {}

  async forAccount(account: Account.Row): Promise<HeroStanding> {
    const ruleset = currentRuleset();
    const today = localDateAt(Date.now(), account.timezone);
    const date = formatLocalDate(today);
    const period = crownPeriodOf(ruleset, crownCadenceFor(ruleset, account.intensityMode), today);

    const [holders, days, recoveryPending] = await Promise.all([
      this.repository.listShieldHolders(account.id),
      this.repository.listDailyStates(account.id, formatLocalDate(period.start), date),
      this.repository.hasPendingRecovery(account.id, date),
    ]);
    const todayState = days.find(day => day.date === date);

    return {
      ...levelProgress(ruleset, account),
      ...shieldStanding(ruleset, holders),
      crown: crownWindow(period, today, days),
      persona: personaFor(todayState, recoveryPending),
      comeback: comebackFor(todayState),
    };
  }
}
