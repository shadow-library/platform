/**
 * Importing npm packages
 */
import { and, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type CommandLog, type DatabaseTransaction, type PrimaryDatabase, schema } from '@server/database';

import { type CommandEnvelope, type CommandResult } from './command.types';

/**
 * `command_log` is owner-scoped data, but — like `AccountRepository` — deliberately not reached through
 * `OwnerScopedRepository`: system commands (rollover, deletion resumption) run with no request context,
 * so the account is always an explicit argument here rather than an ambient one.
 */
@Injectable()
export class CommandLogRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Opens the command's one transaction and serializes the account inside it (ARCHITECTURE §11.2). The
   * account id is the advisory-lock key directly rather than §11.2's `hashint8` of it: `hashint8` folds
   * a bigserial into 32 bits, so two accounts could block each other for no reason, while the id itself
   * is already unique and already a bigint. Daily rollover catch-up takes this same lock.
   */
  async runSerialized<T>(accountId: bigint, operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${accountId})`);
      return operation(tx);
    });
  }

  /** Inserts the command before anything it does: `false` means a previous run already owns this id and its recorded result stands. */
  async claim(tx: DatabaseTransaction, accountId: bigint, envelope: CommandEnvelope): Promise<boolean> {
    const [claimed] = await tx
      .insert(schema.commandLog)
      .values({ accountId, commandId: envelope.commandId, type: envelope.type, status: 'applied', deviceId: envelope.deviceId ?? null })
      .onConflictDoNothing({ target: [schema.commandLog.accountId, schema.commandLog.commandId] })
      .returning({ commandId: schema.commandLog.commandId });
    return Boolean(claimed);
  }

  async findRecorded(tx: DatabaseTransaction, accountId: bigint, commandId: string): Promise<CommandLog.Row | null> {
    const [recorded] = await tx
      .select()
      .from(schema.commandLog)
      .where(and(eq(schema.commandLog.accountId, accountId), eq(schema.commandLog.commandId, commandId)));
    return recorded ?? null;
  }

  async recordResult(tx: DatabaseTransaction, accountId: bigint, commandId: string, outcome: CommandResult): Promise<void> {
    await tx
      .update(schema.commandLog)
      .set({ status: outcome.status, result: outcome.result })
      .where(and(eq(schema.commandLog.accountId, accountId), eq(schema.commandLog.commandId, commandId)));
  }
}
