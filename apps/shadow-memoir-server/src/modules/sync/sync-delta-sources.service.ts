/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AccountContext, AccountRepository } from '@modules/auth';
import { type Account, schema } from '@server/database';

import { DeltaRepository, type SyncableTable } from './delta.repository';
import { DeltaSourceRegistry } from './delta-source.registry';
import { type DeltaRow, type KeysetDeltaSource, type SnapshotDeltaSource } from './sync.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The domains backed by tables the sync spine itself owns. Anything a later module adds — quest
 * occurrences it reshapes, expenses, quick logs, metrics — is registered by that module instead, which
 * is why `DeltaSourceRegistry` exists at all. `quests`, `quest_logs`, `daily_states` and `quest_streaks`
 * sit here for now because their owning modules (T-18, T-19) do not exist yet; each should move to its
 * module as that module lands, without the assembler changing.
 */
const KEYSET_TABLES: [string, SyncableTable][] = [
  ['quests', schema.quests],
  ['quest_logs', schema.questLogs],
  ['daily_states', schema.dailyStates],
  ['quest_streaks', schema.questStreaks],
];

/** The owner's own row, minus everything that identifies the account to itself — no DTO on this service ever carries an account id or an identity subject. */
function toAccountSnapshot(account: Account.Row): DeltaRow {
  return {
    email: account.email,
    displayName: account.displayName,
    photoUrl: account.photoUrl,
    authProvider: account.authProvider,
    defaultCurrency: account.defaultCurrency,
    enabledCurrencies: account.enabledCurrencies,
    timezone: account.timezone,
    scheduleStartMin: account.scheduleStartMin,
    scheduleEndMin: account.scheduleEndMin,
    theme: account.theme,
    weekStart: account.weekStart,
    intensityMode: account.intensityMode,
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
    notificationPrefs: account.notificationPrefs,
    ocrQuotaDate: account.ocrQuotaDate,
    ocrQuotaCount: account.ocrQuotaCount,
    onboardingCompletedAt: account.onboardingCompletedAt?.toISOString() ?? null,
    updatedAt: account.updatedAt.toISOString(),
  };
}

@Injectable()
export class SyncDeltaSources implements OnModuleInit {
  constructor(
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
    private readonly accountContext: AccountContext,
    private readonly accountRepository: AccountRepository,
  ) {}

  onModuleInit(): void {
    for (const [domain, table] of KEYSET_TABLES) this.registry.register(this.keysetSource(domain, table));
    this.registry.register(this.accountSource());
  }

  private keysetSource(domain: string, table: SyncableTable): KeysetDeltaSource {
    return { domain, kind: 'keyset', fetch: ({ since, limit }) => this.deltaRepository.fetchSince(table, since, limit) };
  }

  /**
   * `accounts` carries no `sync_seq` — it is the one row that always belongs to the puller, so a
   * watermark would cost a column and a migration to save nothing. It ships as a snapshot instead, and
   * the client replaces its local copy on every pull.
   */
  private accountSource(): SnapshotDeltaSource {
    return {
      domain: 'account',
      kind: 'snapshot',
      fetch: async () => {
        const accountId = this.accountContext.getAccountId();
        if (accountId === null) return [];
        const account = await this.accountRepository.findById(accountId);
        return account ? [toAccountSnapshot(account)] : [];
      },
    };
  }
}
