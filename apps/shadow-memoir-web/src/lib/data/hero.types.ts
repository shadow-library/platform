import { type StatAffinity } from './quest.types';
import { type CrownPeriod, type HeroState } from './view.types';

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

/** `achievement` cosmetics are never purchasable — coins and achievements are the only two acquisition paths (PRD §2.9). */
export type CosmeticState = 'equipped' | 'owned' | 'affordable' | 'short' | 'achievement';

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

export interface ProgressionEvent {
  id: string;
  when: string;
  title: string;
  meta: string;
  value: string;
  rewarded: boolean;
}

export interface LifetimeStat {
  stat: StatAffinity;
  label: string;
  value: number;
  percentOfBest: number;
  note: string;
}

export interface CrownRecord {
  label: string;
  banked: boolean;
}

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

export interface RecoveryChoice {
  id: string;
  title: string;
  body: string;
  effect: string;
  actionLabel: string;
  to: string;
}

export interface IntensityOption {
  mode: HeroIntensityMode;
  name: string;
  description: string;
}

export interface MissedWhileAway {
  id: string;
  title: string;
  meta: string;
  state: string;
}

export interface RecoveryView {
  headline: string;
  body: string;
  stats: { label: string; value: number; unit?: string }[];
  choices: RecoveryChoice[];
  intensity: HeroIntensityMode;
  intensityOptions: IntensityOption[];
  missed: MissedWhileAway[];
  progressPercent: number;
  progressNote: string;
  overload: { title: string; body: string } | null;
  shieldNote: string;
  crown: CrownPeriod;
}

export type HeroCommand =
  | { type: 'title.display'; titleId: string | null }
  | { type: 'cosmetic.purchase'; cosmeticId: string }
  | { type: 'cosmetic.equip'; cosmeticId: string }
  | { type: 'intensity.set'; mode: HeroIntensityMode };
