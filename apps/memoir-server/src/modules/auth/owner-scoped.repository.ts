import { and, eq, type SQL } from 'drizzle-orm';
import { type AnyPgColumn, type AnyPgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { type DatabaseTransaction, type PrimaryDatabase, schema, syncStamped } from '@server/database';

import { AccountContext } from './account-context';

export type OwnedTable = AnyPgTable & { accountId: AnyPgColumn };

export type SqlExecutor = PrimaryDatabase | DatabaseTransaction;

/**
 * The only entry point domain repositories use to touch a user-owned table. `scoped()` ANDs the request's resolved `account_id` into every read;
 * `forAccount()` is the separately-named escape hatch for machine principals (AI worker read assembly, deletion machine).
 * The root `eslint.config.ts` confines `getPostgresClient` to `*.repository.ts` and `database/`, backing this up at review time.
 * A concrete repository declares no constructor and still resolves: DI reads `design:paramtypes` via the prototype chain, but TypeScript only
 * emits it for a decorated class, hence `@Injectable()` on this abstract class.
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

  /** `table` is cast for `.from()` only: Drizzle's empty-selection check can't be proven over a generic `T`, while `table.accountId` below stays fully typed. */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Drizzle's generic PgSelect chain type isn't practical to spell out by hand
  protected scoped<T extends OwnedTable>(table: T, ...conditions: (SQL | undefined)[]) {
    return this.using(this.db).scoped(table, ...conditions);
  }

  /**
   * The only sanctioned UPDATE on a user-owned table: ANDs the caller's `account_id` into the predicate and re-stamps `sync_seq` so the row lands ahead of every delta cursor.
   * Drizzle applies `.set()` before `.where()`, so the predicate is taken here as conditions.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- same as scoped() above
  protected scopedUpdate<T extends OwnedTable>(table: T, values: Record<string, unknown>, ...conditions: (SQL | undefined)[]) {
    return this.using(this.db).update(table, values, ...conditions);
  }

  protected transaction<T>(operation: (executor: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(operation);
  }

  /** The same owner-scoped writers bound to a caller-supplied executor, for work that must commit with something else (a command's transaction, a delete and its tombstone). */
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

      /** The deleting transaction's own announcement of the delete; `recordId` is the client-visible key, stringified. */
      tombstone: (tableName: string, recordId: string) => executor.insert(schema.deletedRecords).values({ accountId, tableName, recordId }),
    };
  }

  /** Machine path: scopes to a caller-supplied account id (AI worker read assembly, deletion machine); never used by a user-facing route. */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- same as scoped() above
  protected forAccount(accountId: bigint) {
    return {
      accountId,
      scoped: <T extends OwnedTable>(table: T, ...conditions: (SQL | undefined)[]) =>
        this.db
          .select()
          .from(table as unknown as AnyPgTable)
          .where(and(eq(table.accountId, accountId), ...conditions)),
    };
  }

  protected requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('OwnerScopedRepository used without a resolved account context');
    return accountId;
  }
}
