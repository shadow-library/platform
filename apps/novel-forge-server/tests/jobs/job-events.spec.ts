import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';

import { JobService } from '@modules/jobs/job.service';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ORIGIN = { sessionId: SESSION, messageId: '4', proposalId: '9', opIndex: 0 } as const;

interface Transition {
  projectId: bigint;
  kind: string;
  status: string;
  sessionId: string | null;
  attempts?: number;
  progress?: unknown;
}

interface Setup {
  jobs?: Transition[];
  inserted?: boolean;
  existing?: { id: string; status: string };
  failEvents?: boolean;
}

/** Keeps one ordered log of transactions, writes and publishes, so a test can see what committed together and what was heard when. */
function jobsOver({ jobs = [], inserted = true, existing, failEvents = false }: Setup) {
  const log: string[] = [];
  const recorded: Record<string, unknown>[] = [];
  const jobUpdates: unknown[] = [];
  let seq = 6;
  const settled = (value: unknown) => Object.assign(Promise.resolve(value), { returning: async () => value });
  const db = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      log.push('begin');
      const result = await run(db);
      log.push('commit');
      return result;
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table !== schema.jobEvents) return { onConflictDoNothing: () => ({ returning: async () => (inserted ? [{ id: 'job-1' }] : []) }) };
        if (failEvents) return Promise.reject(new Error('insert or update on table "job_events" violates foreign key constraint'));
        log.push(`event:${String(values['type'])}`);
        recorded.push(values);
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          if (table === schema.chatSessions) return settled([{ seq: ++seq }]);
          if (table === schema.jobs) jobUpdates.push(values);
          return settled(table === schema.jobs ? jobs : []);
        },
      }),
    }),
    query: { jobs: { findFirst: async () => existing } },
  };
  const events = { publish: (_: bigint, event: { status: string }) => void log.push(`publish:${event.status}`) };
  const service = new JobService({ getPostgresClient: () => db } as never, events as never, new FakeAuthoringClaims().asService());
  return { service, recorded, log, jobUpdates, db };
}

const chatJob = (status: string, extra: Partial<Transition> = {}): Transition => ({ projectId: 1n, kind: 'organise', status, sessionId: SESSION, ...extra });

describe('JobService — events for a job started from a chat', () => {
  it('should record the job queued, with the next seq of its chat, in the transaction that creates it, and publish only once that commits', async () => {
    const { service, recorded, log } = jobsOver({});

    await service.enqueue(1n, 'review', 'chapter-1-judge', { origin: ORIGIN });

    expect(recorded).toEqual([{ jobId: 'job-1', projectId: 1n, sessionId: SESSION, seq: 7, type: 'queued', data: null }]);
    expect(log).toEqual(['begin', 'begin', 'event:queued', 'commit', 'commit', 'publish:pending']);
  });

  it('should leave an active job it dedupes onto untouched, keeping the chat it already reports to', async () => {
    const { service, recorded, log, jobUpdates } = jobsOver({ inserted: false, existing: { id: 'job-1', status: 'in_progress' } });

    const enqueued = await service.enqueueJob(1n, 'review', 'chapter-1-judge', { origin: { ...ORIGIN, sessionId: '22222222-2222-4222-8222-222222222222' } });

    expect(enqueued).toEqual({ id: 'job-1', outcome: 'deduped' });
    expect(jobUpdates).toEqual([]);
    expect(recorded).toEqual([]);
    expect(log).not.toContain('publish:pending');
  });

  it('should record each transition with what the chat shows for it, inside its own transaction', async () => {
    const progress = { done: 1, total: 2, current: 'notes', phase: 'staging' };
    const started = jobsOver({ jobs: [chatJob('in_progress', { attempts: 1 })] });
    const step = jobsOver({ jobs: [chatJob('in_progress')] });
    const done = jobsOver({ jobs: [chatJob('done', { progress })] });
    const failed = jobsOver({ jobs: [chatJob('failed')] });

    await started.service.start('job-1');
    await step.service.progress('job-1', progress);
    await done.service.succeed('job-1');
    await failed.service.fail('job-1', 'the gateway timed out');

    expect(started.recorded[0]).toMatchObject({ type: 'started', data: { attempt: 1 } });
    expect(step.recorded[0]).toMatchObject({ type: 'step', data: progress });
    expect(done.recorded[0]).toMatchObject({ type: 'done', data: progress });
    expect(failed.recorded[0]).toMatchObject({ type: 'failed', data: { error: 'the gateway timed out' } });
    expect(done.log).toEqual(['begin', 'begin', 'event:done', 'commit', 'commit', 'publish:done']);
  });

  it('should leave publishing to the caller whose transaction it settled in', async () => {
    const { service, log, db } = jobsOver({ jobs: [chatJob('done')] });

    const settled = await service.succeed('job-1', db as never);

    expect(settled).toMatchObject({ status: 'done' });
    expect(log.filter(entry => entry.startsWith('publish'))).toEqual([]);
  });

  it('should record a retry with when it is due, and a cancel of a job that never started in the transaction that cancels it', async () => {
    const retrying = jobsOver({ jobs: [chatJob('pending', { attempts: 1 })] });
    const cancelled = jobsOver({ jobs: [chatJob('cancelled')] });
    const due = new Date('2026-09-26T10:00:30.000Z');

    await retrying.service.scheduleRetry('job-1', 'AI model call failed', due);
    await cancelled.service.cancel('job-1', 1n);

    expect(retrying.recorded[0]).toMatchObject({ type: 'retrying', data: { attempt: 1, nextAttemptAt: '2026-09-26T10:00:30.000Z' } });
    expect(cancelled.log).toEqual(['begin', 'begin', 'event:cancelled', 'commit', 'commit', 'publish:cancelled']);
  });

  it('should not retry a job whose cancel landed first, and record nothing for it', async () => {
    const { service, recorded } = jobsOver({ jobs: [] });

    const retried = await service.scheduleRetry('job-1', 'AI model call failed', new Date());

    expect(retried).toBeUndefined();
    expect(recorded).toEqual([]);
  });

  it('should settle the job even when its event cannot be recorded', async () => {
    const { service, log } = jobsOver({ jobs: [chatJob('done')], failEvents: true });

    const settled = await service.succeed('job-1');

    expect(settled).toMatchObject({ status: 'done' });
    expect(log).toEqual(['begin', 'begin', 'commit', 'publish:done']);
  });

  it('should record nothing for a job no chat started', async () => {
    const { service, recorded } = jobsOver({ jobs: [{ projectId: 1n, kind: 'publish', status: 'in_progress', sessionId: null }] });

    await service.start('job-1');
    await service.progress('job-1', { done: 0, total: 1, current: 'all', phase: 'publish' });

    expect(recorded).toEqual([]);
  });
});
