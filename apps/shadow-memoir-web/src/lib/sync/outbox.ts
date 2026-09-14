import { isDeadLetterCode } from '@/lib/data/command-errors';
import { type ServerSettlement } from '@/lib/data/command.types';

import { isServerBacked, toWireCommand } from './command-wire';
import { type MemoirStore } from './memoir-store';
import { type DeadLetter, type OutboxEntry, SYNC_META_KEYS, type SyncCommand, type WireCommandOutcome } from './sync.types';
import { uuidv7 } from './uuid';

const MAX_BATCH_SIZE = 100;
const MAX_DEAD_LETTERS = 50;

export interface OutboxOptions {
  deviceId?: string;
  now?: () => Date;
}

export interface AckedCommand {
  entry: OutboxEntry;
  settlement: Extract<ServerSettlement, { status: 'applied' | 'rejected' | 'superseded' | 'failed' }>;
}

/** `held`: a retryable failure keeps its command and everything behind it queued. `stalled`: some entries went unanswered and nothing was dead-lettered. */
export type AckProgress = 'continue' | 'held' | 'stalled';

export interface AckResult {
  /** Every command this batch settled, dead-lettered failures included. Their outbox entries are gone. */
  settled: AckedCommand[];
  progress: AckProgress;
}

function toSettlement(outcome: WireCommandOutcome): AckedCommand['settlement'] {
  if (outcome.status === 'rejected') return { status: 'rejected', code: outcome.error?.code ?? null, result: outcome.result };
  if (outcome.status === 'superseded') return { status: 'superseded', result: outcome.result };
  return { status: 'applied', result: outcome.result };
}

/**
 * The persisted FIFO of commands waiting for the server. Nothing is ever reordered and nothing is ever
 * dropped except on an outcome, so a batch cut short simply resends from its first unacked entry under the
 * same ids — at-least-once on the wire, exactly-once in effect (ADR-0006).
 */
export class Outbox {
  private readonly now: () => Date;

  constructor(
    private readonly store: MemoirStore,
    private readonly options: OutboxOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  mintCommandId(): string {
    return uuidv7(this.now().getTime());
  }

  /** Returns the minted envelope, or null when the command has no server handler and stays purely local. `commandId` lets a caller claim the outcome before the entry can be posted. */
  async enqueue(command: SyncCommand, localDate: string, commandId: string = this.mintCommandId()): Promise<OutboxEntry | null> {
    if (!isServerBacked(command)) return null;

    const wire = toWireCommand(command);
    const performedAt = this.now().toISOString();
    const entry: OutboxEntry = {
      seq: await this.store.nextOutboxSeq(),
      commandId,
      type: wire.type,
      payload: wire.payload,
      performedAt,
      localDate,
      createdAt: performedAt,
      command,
      ...(this.options.deviceId ? { deviceId: this.options.deviceId } : {}),
    };
    await this.store.appendOutbox(entry);
    return entry;
  }

  async pending(): Promise<OutboxEntry[]> {
    return this.store.readOutbox();
  }

  async size(): Promise<number> {
    return (await this.store.readOutbox()).length;
  }

  async deadLetters(): Promise<DeadLetter[]> {
    return (await this.store.readMeta<DeadLetter[]>(SYNC_META_KEYS.deadLetters)) ?? [];
  }

  async dismissDeadLetter(commandId: string): Promise<void> {
    const letters = await this.deadLetters();
    const kept = letters.filter(letter => letter.commandId !== commandId);
    if (kept.length !== letters.length) await this.store.writeMeta(SYNC_META_KEYS.deadLetters, kept);
  }

  /** The next batch to post, in the order the owner performed it, capped at the server's batch limit. */
  async nextBatch(): Promise<OutboxEntry[]> {
    return (await this.pending()).slice(0, MAX_BATCH_SIZE);
  }

  /**
   * Settles a posted batch. A `failed` outcome rolled its transaction back and the server stopped the batch there.
   * When its code says a resend can only fail again, the entry is dead-lettered and the commands behind it go on
   * the next batch; otherwise it stays queued with everything behind it. Every other status is terminal and its
   * entry is removed — `replayed` outcomes included, which is how a resent duplicate converges without a second
   * local effect.
   */
  async ack(batch: OutboxEntry[], outcomes: WireCommandOutcome[]): Promise<AckResult> {
    const settled: AckedCommand[] = [];
    let held = false;

    for (const outcome of outcomes) {
      const entry = batch.find(candidate => candidate.commandId === outcome.commandId);
      if (!entry || settled.some(done => done.entry === entry)) continue;

      if (outcome.status === 'failed') {
        const code = outcome.error?.code ?? null;
        if (!isDeadLetterCode(code)) {
          held = true;
          continue;
        }
        await this.deadLetter(entry, code);
        settled.push({ entry, settlement: { status: 'failed', code } });
        continue;
      }

      await this.store.removeOutbox(outcome.commandId);
      settled.push({ entry, settlement: toSettlement(outcome) });
    }

    if (held) return { settled, progress: 'held' };
    const unacked = batch.length > settled.length;
    const deadLettered = settled.some(done => done.settlement.status === 'failed');
    return { settled, progress: unacked && !deadLettered ? 'stalled' : 'continue' };
  }

  private async deadLetter(entry: OutboxEntry, code: string | null): Promise<void> {
    const letter: DeadLetter = {
      commandId: entry.commandId,
      type: entry.type,
      command: entry.command,
      localDate: entry.localDate,
      createdAt: entry.createdAt,
      code,
      deadLetteredAt: this.now().toISOString(),
    };
    const kept = (await this.deadLetters()).filter(existing => existing.commandId !== entry.commandId);
    await this.store.writeMeta(SYNC_META_KEYS.deadLetters, [...kept, letter].slice(-MAX_DEAD_LETTERS));
    await this.store.removeOutbox(entry.commandId);
  }
}
