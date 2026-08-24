/**
 * Importing npm packages
 */
import { and, asc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type Account, type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/** Captured once, at first contact, from identity's userinfo (ARCHITECTURE §9.1, §10.2); never re-fetched. */
export interface ProfileSnapshot {
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
}

/**
 * Declaring the constants
 */
const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_CURRENCY = 'USD';

/**
 * The one place identity's `sub` becomes a Shadow Memoir account row. Unlike every other repository,
 * this is deliberately not an `OwnerScopedRepository` — there is no account to scope to until this
 * resolves or creates one, so it is the one legitimate raw-`accounts`-table caller outside `database/`.
 */
@Injectable()
export class AccountRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async findByIdentitySub(identitySub: string): Promise<Account.Row | null> {
    const [account] = await this.db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, identitySub));
    return account ?? null;
  }

  async findById(accountId: bigint): Promise<Account.Row | null> {
    const [account] = await this.db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return account ?? null;
  }

  /** A cheap, primary-key-scoped read — deliberately never cached, so a deletion that just started is visible on the very next request. */
  async findDeletionState(accountId: bigint): Promise<Account.DeletionState | null> {
    const [account] = await this.db.select({ deletionState: schema.accounts.deletionState }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return account?.deletionState ?? null;
  }

  /** Machine path for the finance reconciliation sweep, which resolves FX for expenses across every account rather than one caller's own. */
  async findDefaultCurrencies(accountIds: bigint[]): Promise<Map<bigint, string>> {
    const map = new Map<bigint, string>();
    if (accountIds.length === 0) return map;
    const rows = await this.db
      .select({ id: schema.accounts.id, defaultCurrency: schema.accounts.defaultCurrency })
      .from(schema.accounts)
      .where(inArray(schema.accounts.id, accountIds));
    for (const row of rows) map.set(row.id, row.defaultCurrency);
    return map;
  }

  /** Keyset-paginated account ids, for a machine sweep that has to visit every account (the receipts object-orphan sweep, §19.2) rather than one caller's own. */
  async findAllIds(afterId: bigint, limit: number): Promise<bigint[]> {
    const rows = await this.db.select({ id: schema.accounts.id }).from(schema.accounts).where(gt(schema.accounts.id, afterId)).orderBy(asc(schema.accounts.id)).limit(limit);
    return rows.map(row => row.id);
  }

  /**
   * Insert-on-first-contact only: the caller (`AccountContext`) does its own `findByIdentitySub` first
   * and only reaches this when that came back empty, so profile capture (T-17) happens at most once per
   * account. `ON CONFLICT DO NOTHING` then re-select still guards the race between two concurrent
   * first-contact requests for the same `sub` — whichever insert wins, the loser's re-select observes it.
   *
   * Defaults are placeholders pending onboarding (T-17): `authProvider` records `google` because it is
   * the only live provider (ARCHITECTURE §3.3 — Apple is not yet implemented at identity); currency and
   * timezone are the account's own onboarding-editable fields, seeded to values a first sync can run
   * against immediately, overridden by `profile` where identity's userinfo answered.
   */
  async create(identitySub: string, profile: ProfileSnapshot = {}): Promise<Account.Row> {
    const [inserted] = await this.db
      .insert(schema.accounts)
      .values({ identitySub, authProvider: 'google', defaultCurrency: DEFAULT_CURRENCY, enabledCurrencies: [DEFAULT_CURRENCY], timezone: DEFAULT_TIMEZONE, ...profile })
      .onConflictDoNothing({ target: schema.accounts.identitySub })
      .returning();
    if (inserted) return inserted;

    const created = await this.findByIdentitySub(identitySub);
    if (!created) throw AppError.internal(`account create-on-first-contact converged to no row for sub '${identitySub}'`);
    return created;
  }

  /**
   * The only sanctioned path for `PATCH /account` and `POST /account/onboarding` (T-17): `accounts` is
   * keyed by `id`, not `account_id`, so it sits outside `OwnerScopedRepository`'s scoping and carries no
   * `sync_seq` to re-stamp — the snapshot `DeltaSource` reads the fresh row on every pull instead.
   */
  async update(accountId: bigint, values: Partial<typeof schema.accounts.$inferInsert>): Promise<Account.Row> {
    const [account] = await this.db
      .update(schema.accounts)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.accounts.id, accountId))
      .returning();
    if (!account) throw AppError.internal(`account update targeted a nonexistent account id '${accountId}'`);
    return account;
  }

  /** Guarded by `onboardingCompletedAt IS NULL` so a second call is a structural no-op (0 rows) rather than a silent re-lock of `defaultCurrency`; the service reads the empty result as "already onboarded". */
  async completeOnboarding(accountId: bigint, values: Partial<typeof schema.accounts.$inferInsert>): Promise<Account.Row | null> {
    const [account] = await this.db
      .update(schema.accounts)
      .set({ ...values, onboardingCompletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.accounts.id, accountId), isNull(schema.accounts.onboardingCompletedAt)))
      .returning();
    return account ?? null;
  }

  /**
   * The atomic consume-before-work OCR quota guard (ARCHITECTURE §14.3): one `UPDATE ... RETURNING`
   * resets the counter on a new local day or increments it on the same one, gated by the same WHERE
   * clause that decides whether the row moves at all — so two concurrent requests against the same
   * account serialize on Postgres's row lock and never both pass. An empty result means the cap was
   * already reached for `today`; the caller reads that as quota-exhausted rather than retrying.
   */
  async consumeOcrQuota(accountId: bigint, today: string, cap: number): Promise<Account.Row | null> {
    const [account] = await this.db
      .update(schema.accounts)
      .set({
        ocrQuotaCount: sql`CASE WHEN ${schema.accounts.ocrQuotaDate} = ${today} THEN ${schema.accounts.ocrQuotaCount} + 1 ELSE 1 END`,
        ocrQuotaDate: today,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.accounts.id, accountId), or(ne(schema.accounts.ocrQuotaDate, today), lt(schema.accounts.ocrQuotaCount, cap))))
      .returning();
    return account ?? null;
  }
}
