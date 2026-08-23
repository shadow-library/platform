/**
 * Importing npm packages
 */
import { and, eq, type SQL } from 'drizzle-orm';
import { type AnyPgColumn, type AnyPgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type DatabaseTransaction, type PrimaryDatabase, schema, syncStamped } from '@server/database';

import { AccountContext } from './account-context';

/**
 * Defining types
 */

/** A user-owned table: every row is scoped by a not-null `account_id` foreign key back to `accounts`. */
export type OwnedTable = AnyPgTable & { accountId: AnyPgColumn };

export type SqlExecutor = PrimaryDatabase | DatabaseTransaction;

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
  protected scoped<T extends OwnedTable>(table: T, ...conditions: (SQL | undefined)[]) {
    return this.using(this.db).scoped(table, ...conditions);
  }

  /**
   * The only sanctioned UPDATE against a user-owned table, for two reasons that both have to hold on
   * every write: the caller's `account_id` is ANDed into the predicate, and `sync_seq` is re-stamped so
   * the mutated row lands ahead of every delta cursor (§12.2). Drizzle applies `.set()` before
   * `.where()`, so the predicate is taken here as conditions rather than left to the caller to chain.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- same as scoped() above
  protected scopedUpdate<T extends OwnedTable>(table: T, values: Record<string, unknown>, ...conditions: (SQL | undefined)[]) {
    return this.using(this.db).update(table, values, ...conditions);
  }

  protected transaction<T>(operation: (executor: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(operation);
  }

  /**
   * The same three owner-scoped writers bound to a caller-supplied executor, for work that has to commit
   * with something else — a command's transaction, or a delete and the tombstone that announces it.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- same as scoped() above
  protected using(executor: SqlExecutor) {
    const accountId = this.requireAccountId();
    return {
      scoped: <T extends OwnedTable>(table: T, ...conditions: (SQL | undefined)[]) =>
        executor
          .select()
          .from(table as unknown as AnyPgTable)
          .where(and(eq(table.accountId, accountId), ...conditions)),

      update: <T extends OwnedTable>(table: T, values: Record<string, unknown>, ...conditions: (SQL | undefined)[]) =>
        executor
          .update(table as unknown as AnyPgTable)
          .set(syncStamped(table, values))
          .where(and(eq(table.accountId, accountId), ...conditions)),

      delete: <T extends OwnedTable>(table: T, ...conditions: (SQL | undefined)[]) =>
        executor.delete(table as unknown as AnyPgTable).where(and(eq(table.accountId, accountId), ...conditions)),

      /** The deleting transaction's own announcement of the delete (§12.2); `recordId` is the client-visible key, stringified. */
      tombstone: (tableName: string, recordId: string) => executor.insert(schema.deletedRecords).values({ accountId, tableName, recordId }),
    };
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

  protected requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('OwnerScopedRepository used without a resolved account context');
    return accountId;
  }
}
