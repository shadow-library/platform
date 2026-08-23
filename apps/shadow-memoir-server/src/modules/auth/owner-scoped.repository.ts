/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { type AnyPgColumn, type AnyPgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type PrimaryDatabase } from '@server/database';

import { AccountContext } from './account-context';

/**
 * Defining types
 */

/** A user-owned table: every row is scoped by a not-null `account_id` foreign key back to `accounts`. */
export type OwnedTable = AnyPgTable & { accountId: AnyPgColumn };

/**
 * Declaring the constants
 */

/**
 * The only entry point domain repositories use to touch a user-owned table (ARCHITECTURE §8.3, §5.3).
 * `scoped()` appends `account_id = <the request's resolved account>` to every read; `forAccount()` is
 * the explicit, separately-named escape hatch machine principals use to legitimately act across
 * accounts (the AI worker's read assembly, the deletion state machine). There is deliberately no third
 * way to reach these tables — the root `eslint.config.ts` `getPostgresClient` restriction backs this up
 * at review time by confining that call to `*.repository.ts` files and `database/`.
 *
 * A concrete repository normally declares no constructor of its own (`class QuestRepository extends
 * OwnerScopedRepository {}` — see the ARCHITECTURE §8.3 example) and still resolves correctly: DI reads
 * `design:paramtypes` off the nearest declared constructor via the prototype chain, but TypeScript only
 * emits that metadata for a class carrying its own decorator — hence `@Injectable()` here too, even
 * though this class is never itself registered as a provider (it is `abstract`).
 */
@Injectable()
export abstract class OwnerScopedRepository {
  protected readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly accountContext: AccountContext,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Every predicate against `table` is implicitly ANDed with the caller's own `account_id` — never a
   * value the caller supplies. `table` is cast for `.from()` only: Drizzle's static "empty selection"
   * check can't be proven over a generic `T`, so the cast trades the exact per-table row type for the
   * genericity every user-owned table needs; `table.accountId` used in the `where` clause below stays
   * fully typed off the original, uncast `table`.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Drizzle's generic PgSelect chain type isn't practical to spell out by hand
  protected scoped<T extends OwnedTable>(table: T) {
    return this.db
      .select()
      .from(table as unknown as AnyPgTable)
      .where(eq(table.accountId, this.requireAccountId()));
  }

  /**
   * The explicit, auditable machine path: scopes to a caller-supplied account id instead of the
   * request's resolved one. Used by the AI worker's consent-scoped read assembly and the deletion state
   * machine — never by a user-facing route, which has no legitimate reason to name another account.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- same as scoped() above
  protected forAccount(accountId: bigint) {
    return {
      accountId,
      scoped: <T extends OwnedTable>(table: T) =>
        this.db
          .select()
          .from(table as unknown as AnyPgTable)
          .where(eq(table.accountId, accountId)),
    };
  }

  private requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('OwnerScopedRepository used without a resolved account context');
    return accountId;
  }
}
