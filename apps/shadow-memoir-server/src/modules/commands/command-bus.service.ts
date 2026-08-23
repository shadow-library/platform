/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { CommandLogRepository } from './command-log.repository';
import { type CommandEnvelope, type CommandHandler, type CommandOutcome } from './command.types';

/**
 * Every Hero-affecting write enters here (ARCHITECTURE §9.3, §11.2). One command is one transaction:
 * serialize the account, claim the client's command id, dispatch, record the response snapshot — so a
 * replay of a committed command reads its recorded body back instead of running the handler twice, and
 * a failed command leaves the claim behind with it.
 *
 * The account is an explicit argument, never read from the envelope: request-scoped callers pass the
 * one `AccountContext` resolved, and system commands pass the account they were scheduled for.
 *
 * The handler registry is populated at module init from code, so it is identical in every replica.
 */
@Injectable()
export class CommandBus {
  private readonly handlers = new Map<string, CommandHandler>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly commandLog: CommandLogRepository,
  ) {}

  registerHandler(type: string, handler: CommandHandler): void {
    if (this.handlers.has(type)) throw AppError.internal(`a command handler for '${type}' is already registered`);
    this.handlers.set(type, handler);
  }

  registeredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  async execute(accountId: bigint, envelope: CommandEnvelope): Promise<CommandOutcome> {
    const handler = this.handlers.get(envelope.type);
    if (!handler) throw AppErrorCode.CMD_001.create({ type: envelope.type });

    try {
      return await this.commandLog.runSerialized(accountId, async tx => {
        const claimed = await this.commandLog.claim(tx, accountId, envelope);
        if (!claimed) {
          const recorded = await this.commandLog.findRecorded(tx, accountId, envelope.commandId);
          if (!recorded) throw AppError.internal(`command '${envelope.commandId}' conflicted on claim but could not be read back for account '${accountId}'`);
          return { commandId: envelope.commandId, status: recorded.status, result: (recorded.result as Record<string, unknown>) ?? {}, replayed: true };
        }

        const outcome = await handler({ accountId, envelope, tx });
        await this.commandLog.recordResult(tx, accountId, envelope.commandId, outcome);
        return { commandId: envelope.commandId, status: outcome.status, result: outcome.result, replayed: false };
      });
    } catch (error) {
      /** `DatabaseService.run` cannot wrap this: it collapses every non-postgres failure into an internal error, which would bury the domain errors handlers raise. */
      if (AppError.is(error)) throw error;
      this.databaseService.translateError(error);
    }
  }
}
