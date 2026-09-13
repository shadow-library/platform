import {
  type CaptureTarget,
  type Command,
  type CommandResult,
  type DataProvider,
  type DayView,
  type DispatchOptions,
  MemoirEngine,
  type MemoirWorldState,
  needsConfirmation,
  type PlanRange,
  type PlanView,
  type QuestDetail,
  type QuestDraft,
  type QuestDraftPreview,
  type QuestFilter,
  type QuestSummary,
} from '@/lib/data';

import { isQuestCommand, isServerBacked } from './command-wire';
import { ignoreAccountBoundary } from './memoir-store';
import { type SyncEngine } from './sync-engine';

function occurrenceOf(command: Command): string | null {
  return 'occurrenceId' in command ? command.occurrenceId : null;
}

/**
 * Reads render from the projected local world, never from the network; writes apply optimistically through
 * the same `MemoirEngine` the fixtures run and then enqueue a command. A rejected or superseded outcome is
 * corrected by the next delta pull rather than by unwinding the local apply — idempotency, not merge
 * (ADR-0006).
 */
export class SyncedDataProvider implements DataProvider {
  private engine: MemoirEngine;
  private world: MemoirWorldState;
  private queued = new Set<string>();
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly sync: SyncEngine) {
    this.world = sync.world();
    this.engine = new MemoirEngine(this.world, this.queued);
    sync.subscribeProjection(() => this.serialize(() => this.reproject()));
  }

  /** Reprojection and dispatch take turns, so a dispatch can never land between a reprojection's outbox read and its swap and be dropped from the queued set. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.pending.then(task);
    this.pending = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * A delta page replaces the projected world wholesale, but the optimistic effects of commands still in
   * the outbox live only in the old one — so the engine is rebuilt from the server's rows and whatever is
   * still queued is replayed over it, and marked queued. A command the server has already applied is no
   * longer in the queue, so the replay cannot double it.
   */
  async reproject(): Promise<void> {
    const world = this.sync.world();
    const queued = new Set<string>();
    const engine = new MemoirEngine(world, queued);
    for (const entry of await this.sync.outbox.pending()) {
      if (!isQuestCommand(entry.command)) continue;
      await engine.dispatchCommand(entry.command);
      const occurrenceId = occurrenceOf(entry.command);
      if (occurrenceId) queued.add(occurrenceId);
    }
    this.world = world;
    this.queued = queued;
    this.engine = engine;
  }

  getDay(date: string): Promise<DayView> {
    return this.engine.getDay(date);
  }

  getPlan(range: PlanRange): Promise<PlanView> {
    return this.engine.getPlan(range);
  }

  listQuests(filter: QuestFilter): Promise<QuestSummary[]> {
    return this.engine.listQuests(filter);
  }

  getQuest(questId: string): Promise<QuestDetail> {
    return this.engine.getQuest(questId);
  }

  previewDraft(draft: QuestDraft): Promise<QuestDraftPreview> {
    return this.engine.previewDraft(draft);
  }

  findOccurrences(query: string, date: string): Promise<CaptureTarget[]> {
    return this.engine.findOccurrences(query, date);
  }

  /** A confirmation is a local decision the owner has not made yet, so it never reaches the outbox. */
  dispatchCommand(command: Command, options?: DispatchOptions): Promise<CommandResult> {
    return this.serialize(() => this.dispatchNow(command, options));
  }

  private async dispatchNow(command: Command, options?: DispatchOptions): Promise<CommandResult> {
    const result = await this.engine.dispatchCommand(command);
    if (needsConfirmation(result) || result.status === 'rejected') return result;
    const occurrenceId = occurrenceOf(command);
    if (occurrenceId && isServerBacked(command)) this.queued.add(occurrenceId);
    const delivery = await this.sync.enqueue(command, this.world.today, options);
    if (delivery.status === 'refused') await this.reproject().catch(ignoreAccountBoundary);
    return { ...result, delivery };
  }
}
