/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { AuthProvider, DeletionState, IntensityMode, Theme, WarmthState } from '@server/classes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** A pattern rather than `format: 'date-time'`-adjacent IANA validation — the class-schema layer has no timezone format; `AccountService` validates via `Intl.DateTimeFormat`. */
const CURRENCY_PATTERN = '^[A-Za-z]{3}$';

@Schema()
export class NotificationPrefsDto {
  @Field({ description: 'Weekly-review digest email (Sunday, day/time configurable in a later phase)' })
  weeklyDigest: boolean;

  @Field({ description: 'AI-result-readiness email (Phase 2)' })
  aiReadiness: boolean;

  @Field({ description: 'Subscription billing-reminder email' })
  billingReminders: boolean;
}

@Schema()
export class NotificationPrefsPatchDto {
  @Field({ optional: true })
  weeklyDigest?: boolean;

  @Field({ optional: true })
  aiReadiness?: boolean;

  @Field({ optional: true })
  billingReminders?: boolean;
}

@Schema()
export class AccountResponseDto {
  @Field(() => String)
  id: string;

  @Field({ optional: true, nullable: true })
  email?: string | null;

  @Field({ optional: true, nullable: true })
  displayName?: string | null;

  @Field({ optional: true, nullable: true })
  photoUrl?: string | null;

  @Field(() => AuthProvider)
  authProvider: string;

  @Field({ description: 'ISO 4217 currency code; immutable once onboarding completes' })
  defaultCurrency: string;

  @Field(() => [String])
  enabledCurrencies: string[];

  @Field({ description: 'IANA timezone; the day-boundary authority for this account' })
  timezone: string;

  @Field({ optional: true, nullable: true, description: 'Staged by PATCH, not yet live; takes effect at the next daily rollover' })
  pendingTimezone?: string | null;

  @Field({ minimum: 0, maximum: 1439 })
  scheduleStartMin: number;

  @Field({ minimum: 0, maximum: 1439 })
  scheduleEndMin: number;

  @Field(() => Theme)
  theme: string;

  @Field({ minimum: 0, maximum: 6 })
  weekStart: number;

  @Field(() => IntensityMode)
  intensityMode: string;

  @Field(() => IntensityMode, { optional: true, nullable: true, description: 'Staged by PATCH, not yet live; takes effect at the next daily rollover' })
  pendingIntensityMode?: string | null;

  @Field({ minimum: 1, maximum: 90 })
  returnerThresholdDays: number;

  @Field(() => NotificationPrefsDto)
  notificationPrefs: NotificationPrefsDto;

  @Field({ optional: true, nullable: true, format: 'date-time', description: 'Null routes the client back into the forced-essentials onboarding flow' })
  onboardingCompletedAt?: string | null;

  @Field()
  level: number;

  @Field(() => String)
  totalXp: string;

  @Field()
  coins: number;

  @Field()
  statDiscipline: number;

  @Field()
  statBody: number;

  @Field()
  statWealth: number;

  @Field()
  statMind: number;

  @Field()
  hpToday: number;

  @Field()
  hpStartToday: number;

  @Field()
  hpMax: number;

  @Field({ optional: true, nullable: true, format: 'date' })
  lastHpDate?: string | null;

  @Field({ optional: true, nullable: true, format: 'date' })
  lastActiveDate?: string | null;

  @Field({ optional: true, nullable: true })
  capacityBaseline?: number | null;

  @Field(() => WarmthState)
  warmthState: string;

  @Field({ optional: true, nullable: true, format: 'date' })
  crownPeriodStart?: string | null;

  @Field({ optional: true, nullable: true })
  crownRemaining?: number | null;

  @Field({ optional: true, nullable: true })
  crownCoinsRemaining?: number | null;

  @Field({ optional: true, nullable: true })
  displayedTitleId?: string | null;

  @Field(() => Object, { additionalProperties: true })
  featureFlags: Record<string, unknown>;

  @Field({ optional: true, nullable: true, format: 'date' })
  ocrQuotaDate?: string | null;

  @Field()
  ocrQuotaCount: number;

  @Field(() => DeletionState)
  deletionState: string;

  @Field({ format: 'date-time' })
  createdAt: string;

  @Field({ format: 'date-time' })
  updatedAt: string;
}

@Schema()
export class AccountPatchDto {
  /** Never writable through this route (§5.5); declared only so the field survives AJV's `removeAdditional` and the service can reject it with a typed, named error instead of silently dropping it. */
  @Field({ optional: true })
  authProvider?: string;

  /** Never writable through this route — locked by `POST /account/onboarding` (§5.5); see {@link authProvider} for why it is declared here at all. */
  @Field({ optional: true })
  defaultCurrency?: string;

  /** @see {@link authProvider} */
  @Field({ optional: true })
  createdAt?: string;

  /** @see {@link authProvider} */
  @Field({ optional: true })
  updatedAt?: string;

  @Field({ optional: true, description: 'Staged, not applied immediately — see `pendingTimezone` on the GET response' })
  timezone?: string;

  @Field({ optional: true, minimum: 0, maximum: 1439 })
  scheduleStartMin?: number;

  @Field({ optional: true, minimum: 0, maximum: 1439 })
  scheduleEndMin?: number;

  @Field(() => Theme, { optional: true })
  theme?: string;

  @Field({ optional: true, minimum: 0, maximum: 6, errorMessage: 'weekStart must be between 0 (Sunday) and 6 (Saturday)' })
  weekStart?: number;

  @Field(() => IntensityMode, { optional: true, description: 'Staged, not applied immediately — see `pendingIntensityMode` on the GET response' })
  intensityMode?: string;

  @Field({ optional: true, minimum: 1, maximum: 90, errorMessage: 'returnerThresholdDays must be between 1 and 90' })
  returnerThresholdDays?: number;

  @Field(() => NotificationPrefsPatchDto, { optional: true })
  notificationPrefs?: NotificationPrefsPatchDto;
}

@Schema()
export class OnboardingDto {
  @Field({ pattern: CURRENCY_PATTERN, errorMessage: 'defaultCurrency must be a 3-letter uppercase ISO 4217 code' })
  defaultCurrency: string;

  @Field(() => [String], { optional: true, description: 'Additional enabled currencies beyond defaultCurrency, which is always included' })
  enabledCurrencies?: string[];

  @Field({ description: 'IANA timezone' })
  timezone: string;

  @Field({ minimum: 0, maximum: 1439 })
  scheduleStartMin: number;

  @Field({ minimum: 0, maximum: 1439 })
  scheduleEndMin: number;
}
