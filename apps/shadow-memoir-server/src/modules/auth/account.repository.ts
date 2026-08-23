/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
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

  /** A cheap, primary-key-scoped read — deliberately never cached, so a deletion that just started is visible on the very next request. */
  async findDeletionState(accountId: bigint): Promise<Account.DeletionState | null> {
    const [account] = await this.db.select({ deletionState: schema.accounts.deletionState }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return account?.deletionState ?? null;
  }

  /**
   * Upsert-on-first-contact: `INSERT ... ON CONFLICT DO NOTHING` then re-select, so two concurrent
   * first-contact requests for the same `sub` converge on exactly one row — whichever insert wins, the
   * loser's re-select observes it, instead of racing a plain read-then-insert into a unique violation.
   *
   * Defaults are placeholders pending onboarding (T-17): `authProvider` records `google` because it is
   * the only live provider (ARCHITECTURE §3.3 — Apple is not yet implemented at identity); currency and
   * timezone are the account's own onboarding-editable fields, seeded to values a first sync can run
   * against immediately rather than left to block on a profile the identity `userinfo` endpoint does not
   * carry (it has no upstream-provider claim to derive `authProvider` from either).
   */
  async resolveOrCreate(identitySub: string): Promise<Account.Row> {
    const existing = await this.findByIdentitySub(identitySub);
    if (existing) return existing;

    const [inserted] = await this.db
      .insert(schema.accounts)
      .values({ identitySub, authProvider: 'google', defaultCurrency: DEFAULT_CURRENCY, enabledCurrencies: [DEFAULT_CURRENCY], timezone: DEFAULT_TIMEZONE })
      .onConflictDoNothing({ target: schema.accounts.identitySub })
      .returning();
    if (inserted) return inserted;

    const created = await this.findByIdentitySub(identitySub);
    if (!created) throw AppError.internal(`account upsert-on-first-contact converged to no row for sub '${identitySub}'`);
    return created;
  }
}
