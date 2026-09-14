import { type StatAffinity } from './quest.types';
import { type HeroState } from './view.types';

export type HeroIntensityMode = 'gentle' | 'standard' | 'demanding';

/** Locked achievements carry a teaser and nothing countable — a progress number turns the catalogue into a chore (PRD §2.9). */
export interface Achievement {
  id: string;
  name: string;
  crest: string;
  teaser: string;
  description: string;
  reward: string;
  earnedOn: string | null;
}

export interface HeroTitle {
  id: string;
  name: string;
  earnedFrom: string;
  earnedOn: string | null;
}

export type CosmeticKind = 'badge' | 'hero_accent' | 'theme_accent';

export type AccentKey = 'ember' | 'frost' | 'aurora' | 'sunrise' | 'midnight' | 'returner';

/** `achievement` is never purchasable (PRD §2.9); `starter` is owned by every account but never server-granted, so it carries no action until that lands. */
type CosmeticState = 'equipped' | 'owned' | 'affordable' | 'short' | 'achievement' | 'starter';

export interface Cosmetic {
  id: string;
  name: string;
  glyph: string;
  kind: CosmeticKind;
  state: CosmeticState;
  priceCoins: number | null;
  shortfallCoins: number | null;
  note: string;
}

interface ProgressionEvent {
  id: string;
  when: string;
  title: string;
  meta: string;
  value: string;
  rewarded: boolean;
}

interface LifetimeStat {
  stat: StatAffinity;
  label: string;
  value: number;
  percentOfBest: number;
  note: string;
}

interface CrownRecord {
  label: string;
  banked: boolean;
}

/** `returner`: the Returner ritual fired today. `recovery`: a recovery quest is waiting today. `comeback`: a comeback bonus is armed or was claimed today. */
export type ComingBackReason = 'returner' | 'recovery' | 'comeback';

export type ComingBack = { kind: 'none' } | { kind: 'offered'; reason: ComingBackReason } | { kind: 'dismissed'; reason: ComingBackReason };

export interface HeroDeck {
  hero: HeroState;
  subtitle: string;
  shields: number;
  shieldCap: number;
  hpNote: string;
  momentumLabel: string;
  momentumNote: string;
  crownNote: string;
  crownHistory: CrownRecord[];
  lifetime: LifetimeStat[];
  events: ProgressionEvent[];
  achievements: Achievement[];
  titles: HeroTitle[];
  displayedTitleId: string | null;
  cosmetics: Cosmetic[];
}

interface RecoveryChoice {
  id: string;
  title: string;
  body: string;
  effect: string;
  actionLabel: string;
  to: string;
}

interface IntensityOption {
  mode: HeroIntensityMode;
  name: string;
  description: string;
}

interface MissedWhileAway {
  id: string;
  title: string;
  meta: string;
  state: string;
}

export interface RecoveryView {
  comingBack: ComingBack;
  headline: string;
  body: string;
  stats: { label: string; value: number; unit?: string }[];
  choices: RecoveryChoice[];
  intensity: HeroIntensityMode;
  /** Staged for the next daily rollover — not yet in effect, so it must never look already selected. */
  pendingIntensity: HeroIntensityMode | null;
  intensityOptions: IntensityOption[];
  missed: MissedWhileAway[];
  progress: { percent: number; note: string } | null;
  overload: { title: string; body: string } | null;
  shieldNote: string;
}

export type HeroCommand =
  | { type: 'title.display'; titleId: string | null }
  | { type: 'cosmetic.purchase'; cosmeticId: string }
  | { type: 'cosmetic.equip'; cosmeticId: string }
  | { type: 'intensity.set'; mode: HeroIntensityMode };
