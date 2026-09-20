import { type CommandLog, type DatabaseTransaction } from '@server/database';

/** One outbox entry as the client minted it (ARCHITECTURE §12.1); `payload` is the per-type body a handler validates. */
export interface CommandEnvelope {
  /** Client-minted UUIDv7, stable across every replay of the same user action — the wire idempotency key. */
  commandId: string;
  type: string;
  payload: Record<string, unknown>;
  /** Claimed instant of the action, bounded and clamped by the handler (§12.5); absent for online commands. */
  performedAt?: string;
  /** The user-local calendar date the action belongs to, in the account's timezone. */
  localDate: string;
  deviceId?: string;
}

export interface CommandContext {
  accountId: bigint;
  envelope: CommandEnvelope;
  tx: DatabaseTransaction;
}

export interface CommandResult {
  status: CommandLog.Status;
  /** Persisted verbatim to `command_log.result` and returned as-is on every later replay. */
  result: Record<string, unknown>;
}

export interface CommandOutcome extends CommandResult {
  commandId: string;
  replayed: boolean;
}

export type CommandHandler = (context: CommandContext) => Promise<CommandResult>;
