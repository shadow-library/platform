import { type AchievementId } from '@modules/rules';

/**
 * Defining types
 */

export type CosmeticKind = 'badge' | 'hero_accent' | 'theme_accent';

export interface CosmeticDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: CosmeticKind;
  /** `null` for an achievement-only cosmetic — PRD §2.9: coins and achievements are the only two acquisition paths, never both for the same item. */
  readonly priceCoins: number | null;
  readonly unlockedByAchievementId?: AchievementId;
}

/**
 * Declaring the constants
 */

/**
 * Reference data, not user data (ADR-0009) — a code-side constant rather than a seeded table, mirroring
 * how `rules/achievement.ts` and `rules/title.ts` hold their own catalogues. Lives in this module, not
 * `rules`, because `rules` is pure and already carries its own purity test; the coin price is a product
 * lever the way rewards are, but the catalogue itself has no rule-evaluation shape to speak of.
 */
export const COSMETIC_CATALOGUE: readonly CosmeticDefinition[] = [
  { id: 'badge_bronze', name: 'Bronze Badge', kind: 'badge', priceCoins: 50 },
  { id: 'badge_silver', name: 'Silver Badge', kind: 'badge', priceCoins: 150 },
  { id: 'badge_gold_streak', name: 'Gold Streak Badge', kind: 'badge', priceCoins: null, unlockedByAchievementId: 'first_gold_streak' },
  { id: 'accent_ember', name: 'Ember Accent', kind: 'hero_accent', priceCoins: 100 },
  { id: 'accent_frost', name: 'Frost Accent', kind: 'hero_accent', priceCoins: 100 },
  { id: 'accent_aurora_platinum', name: 'Aurora Accent', kind: 'hero_accent', priceCoins: null, unlockedByAchievementId: 'first_platinum_streak' },
  { id: 'theme_sunrise', name: 'Sunrise Theme', kind: 'theme_accent', priceCoins: 75 },
  { id: 'theme_midnight', name: 'Midnight Theme', kind: 'theme_accent', priceCoins: 75 },
  { id: 'theme_returner', name: 'Returner Theme', kind: 'theme_accent', priceCoins: null, unlockedByAchievementId: 'first_returner_ritual' },
];

export const findCosmetic = (cosmeticId: string): CosmeticDefinition | undefined => COSMETIC_CATALOGUE.find(cosmetic => cosmetic.id === cosmeticId);

export const cosmeticsUnlockedByAchievement = (achievementId: AchievementId): readonly CosmeticDefinition[] =>
  COSMETIC_CATALOGUE.filter(cosmetic => cosmetic.unlockedByAchievementId === achievementId);
