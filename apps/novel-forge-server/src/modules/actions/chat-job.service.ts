import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { ProjectEventService } from '../events/project-event.service';
import { type JobCancelResult, JobService } from '../jobs/job.service';
import { type ChatJobEvent, ChatJobReader, EVENT_PAGE, TERMINAL_JOB_EVENTS } from './chat-job.reader';

/** Returns `false` once its transport has closed. */
export type ChatJobListener = (event: ChatJobEvent) => boolean;

// The project event bus is in-process, so a follower also polls: briskly while a job of the session runs, and slowly while none does, so a
// job another replica starts is still seen.
const ACTIVE_POLL_MS = 2_000;
const IDLE_POLL_MS = 20_000;

/** Cancels and follows the jobs a chat started. */
@Injectable()
export class ChatJobService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatJobService.name);

  constructor(
    private readonly reader: ChatJobReader,
    private readonly jobService: JobService,
    private readonly events: ProjectEventService,
  ) {}

  async cancel(projectId: bigint, sessionId: string, jobId: string): Promise<JobCancelResult> {
    await this.reader.sessionCursor(projectId, sessionId);
    const result = (await this.reader.isStartedFrom(projectId, sessionId, jobId)) ? await this.jobService.cancel(jobId, projectId) : undefined;
    if (!result) throw AppErrorCode.JOB_001.create();
    this.logger.info('chat job cancel requested', { projectId, sessionId, jobId, outcome: result.outcome });
    return result;
  }

  /**
   * Sends every event after `after`, or with no cursor the bounded replay of what is running and what just ended, then follows the session
   * until the returned stop runs. Reads are serial and the cursor only moves forward, so no event is sent twice.
   */
  follow(projectId: bigint, sessionId: string, after: number | null, listener: ChatJobListener): () => void {
    const active = new Set<string>();
    let cursor = after ?? 0;
    let stopped = false;
    let queue = Promise.resolve();
    let poll: ReturnType<typeof setInterval> | undefined;
    let pollMs: number | undefined;

    const stop = (): void => {
      stopped = true;
      clearInterval(poll);
      unsubscribe();
    };
    const pollAtPace = (): void => {
      const pace = active.size > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      const paceUnchanged = pace === pollMs;
      if (stopped || paceUnchanged) return;
      clearInterval(poll);
      pollMs = pace;
      poll = setInterval(drain, pace);
      poll.unref();
    };
    const deliver = (event: ChatJobEvent): boolean => {
      if (stopped || !listener(event)) {
        stop();
        return false;
      }
      cursor = Math.max(cursor, event.seq);
      if (TERMINAL_JOB_EVENTS.has(event.type)) active.delete(event.jobId);
      else active.add(event.jobId);
      return true;
    };
    const pull = async (): Promise<void> => {
      while (!stopped) {
        const page = await this.reader.eventsAfter(projectId, sessionId, cursor);
        for (const event of page) if (!deliver(event)) return;
        pollAtPace();
        if (page.length < EVENT_PAGE) return;
      }
    };
    const begin = async (): Promise<void> => {
      if (after === null) {
        const replay = await this.reader.replay(projectId, sessionId);
        cursor = replay.cursor;
        for (const jobId of replay.activeJobIds) active.add(jobId);
        for (const event of replay.events) if (!deliver(event)) return;
      } else {
        for (const jobId of await this.reader.activeJobIds(projectId, sessionId)) active.add(jobId);
      }
      pollAtPace();
      await pull();
    };
    const run = (step: () => Promise<void>): void => {
      queue = queue.then(step).catch(err => this.logger.warn('chat job events read failed', { projectId, sessionId, err }));
    };
    const drain = (): void => run(pull);

    const unsubscribe = this.events.subscribe(projectId, event => {
      if (event.type === 'job') drain();
    });
    run(begin);
    return stop;
  }
}
