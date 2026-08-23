import { type Command } from '@/lib/data';

import { isServerBacked, toWireCommand } from './command-wire';
import { type MemoirStore } from './memoir-store';
import { type OutboxEntry, type SyncNotice, type WireCommandOutcome } from './sync.types';
import { uuidv7 } from './uuid';

export const MAX_BATCH_SIZE = 100;

export interface OutboxOptions {
  deviceId?: string;
  now?: () => Date;
}

export interface AckResult {
  /** Commands the server refused, for the UI to state once and calmly. Their outbox entries are gone. */
  notices: SyncNotice[];
  /** True while a command failed mid-batch and everything from it onward is still queued. */
  interrupted: boolean;
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

  /** Returns the minted envelope, or null when the command has no server handler and stays purely local. */
  async enqueue(command: Command, localDate: string): Promise<OutboxEntry | null> {
    if (!isServerBacked(command)) return null;

    const wire = toWireCommand(command);
    const performedAt = this.now().toISOString();
    const entry: OutboxEntry = {
      seq: await this.store.nextOutboxSeq(),
      commandId: uuidv7(this.now().getTime()),
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

  /** The next batch to post, in the order the owner performed it, capped at the server's batch limit. */
  async nextBatch(): Promise<OutboxEntry[]> {
    return (await this.pending()).slice(0, MAX_BATCH_SIZE);
  }

  /**
   * Settles a posted batch. A `failed` outcome rolled its transaction back, so its entry stays queued and
   * everything behind it is left untouched; every other status is terminal and its entry is removed —
   * `replayed` outcomes included, which is how a resent duplicate converges without a second local effect.
   */
  async ack(batch: OutboxEntry[], outcomes: WireCommandOutcome[]): Promise<AckResult> {
    const notices: SyncNotice[] = [];
    let interrupted = outcomes.length < batch.length;

    for (const outcome of outcomes) {
      if (outcome.status === 'failed') {
        interrupted = true;
        continue;
      }
      if (outcome.status === 'rejected') notices.push({ commandId: outcome.commandId, message: outcome.error?.message ?? 'That change could not be saved.' });
      await this.store.removeOutbox(outcome.commandId);
    }

    return { notices, interrupted };
  }
}
