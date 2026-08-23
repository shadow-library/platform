/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountContext, AccountRepository } from '@modules/auth';
import { type DeltaRow, DeltaSourceRegistry, type SnapshotDeltaSource } from '@modules/sync';
import { AppErrorCode } from '@server/classes';
import { type Account, schema } from '@server/database';

import { type AccountPatchDto, type NotificationPrefsDto, type OnboardingDto } from './account.dto';

/**
 * Defining types
 */

export type AccountView = Account.Row & { notificationPrefs: NotificationPrefsDto };

/**
 * Declaring the constants
 */

/** ARCHITECTURE §10.3: the three account-level email categories, all default OFF; stored jsonb starts `{}`. */
function withDefaultNotificationPrefs(prefs: unknown): NotificationPrefsDto {
  const raw = (prefs ?? {}) as Partial<NotificationPrefsDto>;
  return { weeklyDigest: raw.weeklyDigest ?? false, aiReadiness: raw.aiReadiness ?? false, billingReminders: raw.billingReminders ?? false };
}

function toView(account: Account.Row): AccountView {
  return { ...account, notificationPrefs: withDefaultNotificationPrefs(account.notificationPrefs) };
}

/** Throws (rather than merely rejecting the field) so an unresolvable IANA zone reads as a 400, not a stored typo that silently breaks every future rollover's day-boundary math. */
function assertValidTimezone(field: string, timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new ValidationError(field, `Unknown IANA timezone identifier '${timezone}'`);
  }
}

function assertScheduleWindow(endField: string, scheduleStartMin: number, scheduleEndMin: number): void {
  if (scheduleEndMin <= scheduleStartMin) throw new ValidationError(endField, 'scheduleEndMin must be greater than scheduleStartMin');
}

/** `authProvider`/`defaultCurrency`/`createdAt`/`updatedAt` are declared on {@link AccountPatchDto} only so AJV's `removeAdditional` does not silently drop them — a caller naming any of them gets a typed, named rejection instead of a no-op. */
const IMMUTABLE_PATCH_FIELDS = ['authProvider', 'defaultCurrency', 'createdAt', 'updatedAt'] as const;

function assertNoImmutableFields(body: AccountPatchDto): void {
  const field = IMMUTABLE_PATCH_FIELDS.find(candidate => body[candidate] !== undefined);
  if (field) throw AppErrorCode.ACC_004.create({ field });
}

function toDeltaRow(account: Account.Row): DeltaRow {
  return {
    email: account.email,
    displayName: account.displayName,
    photoUrl: account.photoUrl,
    authProvider: account.authProvider,
    defaultCurrency: account.defaultCurrency,
    enabledCurrencies: account.enabledCurrencies,
    timezone: account.timezone,
    pendingTimezone: account.pendingTimezone,
    scheduleStartMin: account.scheduleStartMin,
    scheduleEndMin: account.scheduleEndMin,
    theme: account.theme,
    weekStart: account.weekStart,
    intensityMode: account.intensityMode,
    pendingIntensityMode: account.pendingIntensityMode,
    returnerThresholdDays: account.returnerThresholdDays,
    level: account.level,
    totalXp: String(account.totalXp),
    coins: account.coins,
    statDiscipline: account.statDiscipline,
    statBody: account.statBody,
    statWealth: account.statWealth,
    statMind: account.statMind,
    hpToday: account.hpToday,
    hpStartToday: account.hpStartToday,
    hpMax: account.hpMax,
    lastHpDate: account.lastHpDate,
    lastActiveDate: account.lastActiveDate,
    capacityBaseline: account.capacityBaseline,
    warmthState: account.warmthState,
    crownPeriodStart: account.crownPeriodStart,
    crownRemaining: account.crownRemaining,
    crownCoinsRemaining: account.crownCoinsRemaining,
    displayedTitleId: account.displayedTitleId,
    featureFlags: account.featureFlags,
    notificationPrefs: withDefaultNotificationPrefs(account.notificationPrefs),
    ocrQuotaDate: account.ocrQuotaDate,
    ocrQuotaCount: account.ocrQuotaCount,
    onboardingCompletedAt: account.onboardingCompletedAt?.toISOString() ?? null,
    updatedAt: account.updatedAt.toISOString(),
  };
}

/**
 * Owns `GET/PATCH /account` and `POST /account/onboarding` (T-17). `accounts` sits outside
 * `OwnerScopedRepository` (§9.1, §10.2 — keyed by `id`, no `account_id` self-column), so every read and
 * write here goes through `AccountRepository`, the one legitimate raw-`accounts`-table caller.
 */
@Injectable()
export class AccountService implements OnModuleInit {
  constructor(
    private readonly accountContext: AccountContext,
    private readonly accountRepository: AccountRepository,
    private readonly registry: DeltaSourceRegistry,
  ) {}

  /** Moved from `SyncDeltaSources` (T-16's note): the account snapshot domain is this module's own concern now, mirroring `DeviceService`'s self-registration. */
  onModuleInit(): void {
    const source: SnapshotDeltaSource = { domain: 'account', kind: 'snapshot', fetch: () => this.fetchSnapshot() };
    this.registry.register(source);
  }

  private async fetchSnapshot(): Promise<DeltaRow[]> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) return [];
    const account = await this.accountRepository.findById(accountId);
    return account ? [toDeltaRow(account)] : [];
  }

  async get(): Promise<AccountView> {
    return toView(await this.requireAccount());
  }

  async patch(body: AccountPatchDto): Promise<AccountView> {
    assertNoImmutableFields(body);
    const account = await this.requireAccount();
    const values: Partial<typeof schema.accounts.$inferInsert> = {};

    if (body.timezone !== undefined) {
      assertValidTimezone('body.timezone', body.timezone);
      values.pendingTimezone = body.timezone;
    }
    if (body.intensityMode !== undefined) values.pendingIntensityMode = body.intensityMode as Account.IntensityMode;
    if (body.theme !== undefined) values.theme = body.theme as Account.Theme;
    if (body.weekStart !== undefined) values.weekStart = body.weekStart;
    if (body.returnerThresholdDays !== undefined) values.returnerThresholdDays = body.returnerThresholdDays;

    if (body.scheduleStartMin !== undefined || body.scheduleEndMin !== undefined) {
      const scheduleStartMin = body.scheduleStartMin ?? account.scheduleStartMin;
      const scheduleEndMin = body.scheduleEndMin ?? account.scheduleEndMin;
      assertScheduleWindow('body.scheduleEndMin', scheduleStartMin, scheduleEndMin);
      values.scheduleStartMin = scheduleStartMin;
      values.scheduleEndMin = scheduleEndMin;
    }

    if (body.notificationPrefs) values.notificationPrefs = { ...withDefaultNotificationPrefs(account.notificationPrefs), ...body.notificationPrefs };

    const updated = Object.keys(values).length > 0 ? await this.accountRepository.update(account.id, values) : account;
    return toView(updated);
  }

  async onboard(body: OnboardingDto): Promise<AccountView> {
    const account = await this.requireAccount();
    assertValidTimezone('body.timezone', body.timezone);
    assertScheduleWindow('body.scheduleEndMin', body.scheduleStartMin, body.scheduleEndMin);

    const defaultCurrency = body.defaultCurrency.toUpperCase();
    const enabledCurrencies = Array.from(new Set([defaultCurrency, ...(body.enabledCurrencies ?? []).map(currency => currency.toUpperCase())]));

    const updated = await this.accountRepository.completeOnboarding(account.id, {
      defaultCurrency,
      enabledCurrencies,
      timezone: body.timezone,
      scheduleStartMin: body.scheduleStartMin,
      scheduleEndMin: body.scheduleEndMin,
    });
    if (!updated) throw AppErrorCode.ACC_003.create();
    return toView(updated);
  }

  private async requireAccount(): Promise<Account.Row> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('AccountService used without a resolved account context');
    const account = await this.accountRepository.findById(accountId);
    if (!account) throw AppError.internal(`resolved account id '${accountId}' has no accounts row`);
    return account;
  }
}
