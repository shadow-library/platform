/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** Lifecycle of an in-flight download. `complete` is not modelled here — finished downloads live in the OfflineStore. */
export type DownloadTaskState = 'downloading' | 'paused' | 'failed';

/** A render-friendly view of one active download, exposed through the queue snapshot. */
export interface DownloadTask {
  slug: string;
  title: string;
  total: number;
  completed: number;
  state: DownloadTaskState;
  error?: string;
}

export interface StartDownloadInput {
  slug: string;
  title: string;
  /** Ordinals to fetch, in order. Progress is measured against this length. */
  ordinals: number[];
  /** Fetches and persists a single chapter. A rejection fails the task; already-completed chapters are kept for retry. */
  step: (ordinal: number) => Promise<void>;
  /** Runs once every ordinal is persisted — the place to update the novel record and refresh the screen. */
  onComplete: () => Promise<void>;
}

/** The mutable book-keeping the queue keeps per task; never handed out — snapshots are plain {@link DownloadTask}s. */
interface InternalTask extends DownloadTask {
  ordinals: number[];
  step: (ordinal: number) => Promise<void>;
  onComplete: () => Promise<void>;
  canceled: boolean;
  wakeup: (() => void)[];
}

/**
 * Declaring the constants
 *
 * A tiny in-memory, SSR-safe download manager. Real background-download infrastructure does not exist, so this
 * drives the offline-library states (downloading / paused / failed) cooperatively: it walks the requested
 * ordinals, calling the caller's `step` per chapter and honouring pause/resume/cancel between chapters. A short
 * pace between chapters keeps progress observable and pause responsive. Finished downloads leave the queue and
 * become OfflineStore records, so the queue only ever holds in-flight work.
 */
const PACE_MS = 90;

const EMPTY_TASKS: DownloadTask[] = [];

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class DownloadQueue {
  private readonly tasks = new Map<string, InternalTask>();
  private readonly listeners = new Set<() => void>();
  private snapshot: DownloadTask[] = EMPTY_TASKS;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = (): DownloadTask[] => this.snapshot;

  /** The server render (and hydration) never has active downloads — a stable empty array keeps them in sync. */
  getServerSnapshot = (): DownloadTask[] => EMPTY_TASKS;

  getTask(slug: string): DownloadTask | undefined {
    return this.snapshot.find(task => task.slug === slug);
  }

  start(input: StartDownloadInput): void {
    if (input.ordinals.length === 0 || this.tasks.has(input.slug)) return;
    const task: InternalTask = {
      slug: input.slug,
      title: input.title,
      total: input.ordinals.length,
      completed: 0,
      state: 'downloading',
      ordinals: input.ordinals,
      step: input.step,
      onComplete: input.onComplete,
      canceled: false,
      wakeup: [],
    };
    this.tasks.set(input.slug, task);
    this.emit();
    void this.run(task);
  }

  pause(slug: string): void {
    const task = this.tasks.get(slug);
    if (!task || task.state !== 'downloading') return;
    task.state = 'paused';
    this.emit();
  }

  resume(slug: string): void {
    const task = this.tasks.get(slug);
    if (!task || task.state !== 'paused') return;
    task.state = 'downloading';
    this.wake(task);
    this.emit();
  }

  cancel(slug: string): void {
    const task = this.tasks.get(slug);
    if (!task) return;
    task.canceled = true;
    this.wake(task);
    this.tasks.delete(slug);
    this.emit();
  }

  retry(slug: string): void {
    const task = this.tasks.get(slug);
    if (!task || task.state !== 'failed') return;
    task.state = 'downloading';
    task.error = undefined;
    this.emit();
    void this.run(task);
  }

  private wake(task: InternalTask): void {
    const resolvers = task.wakeup;
    task.wakeup = [];
    resolvers.forEach(resolve => resolve());
  }

  private blockWhilePaused(task: InternalTask): Promise<void> {
    return new Promise(resolve => task.wakeup.push(resolve));
  }

  private async run(task: InternalTask): Promise<void> {
    for (let index = task.completed; index < task.ordinals.length; index++) {
      const ordinal = task.ordinals[index];
      if (ordinal === undefined) continue;
      while (task.state === 'paused') await this.blockWhilePaused(task);
      if (task.canceled) return;
      try {
        await task.step(ordinal);
      } catch (error) {
        task.state = 'failed';
        task.error = error instanceof Error ? error.message : 'Download failed';
        this.emit();
        return;
      }
      if (task.canceled) return;
      task.completed = index + 1;
      this.emit();
      await wait(PACE_MS);
    }
    this.tasks.delete(task.slug);
    try {
      await task.onComplete();
    } finally {
      this.emit();
    }
  }

  private emit(): void {
    this.snapshot = [...this.tasks.values()].map(task => ({
      slug: task.slug,
      title: task.title,
      total: task.total,
      completed: task.completed,
      state: task.state,
      error: task.error,
    }));
    this.listeners.forEach(listener => listener());
  }
}

/** One shared queue for the whole app so any screen observing it sees the same in-flight downloads. */
export const downloadQueue = new DownloadQueue();
