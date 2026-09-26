import { describe, expect, it, jest } from 'bun:test';

import { AppErrorCode } from '@server/classes';
import { type Job } from '@server/database';

import { type ChatJobEvent, type ChatJobReplay } from '@modules/actions/chat-job.reader';
import { ChatJobService } from '@modules/actions/chat-job.service';
import { ChatJobsController } from '@modules/actions/chat-jobs.controller';
import { ProjectEventService } from '@modules/events/project-event.service';

const SESSION = '11111111-1111-4111-8111-111111111111';

function event(seq: number, type: Job.EventType, jobId = 'job-1'): ChatJobEvent {
  return { id: BigInt(seq), seq, jobId, projectId: 1n, sessionId: SESSION, type, data: null, createdAt: new Date(0), kind: 'organise' };
}

/** A session's recorded events and running jobs, read the way the reader answers them. */
class FakeReader {
  readonly events: ChatJobEvent[] = [];
  active: string[] = [];
  replayed: ChatJobReplay = { events: [], cursor: 0, activeJobIds: [] };
  startedHere = new Set<string>();
  readonly reads: number[] = [];

  async sessionCursor(projectId: bigint): Promise<number> {
    if (projectId !== 1n) throw AppErrorCode.CHT_001.create();
    return this.events.at(-1)?.seq ?? 0;
  }

  async eventsAfter(_projectId: bigint, _sessionId: string, after: number): Promise<ChatJobEvent[]> {
    this.reads.push(after);
    return this.events.filter(recorded => recorded.seq > after);
  }

  async activeJobIds(): Promise<string[]> {
    return this.active;
  }

  async replay(): Promise<ChatJobReplay> {
    return this.replayed;
  }

  async isStartedFrom(_projectId: bigint, _sessionId: string, jobId: string): Promise<boolean> {
    return this.startedHere.has(jobId);
  }
}

function serviceOver(
  reader: FakeReader,
  bus = new ProjectEventService(),
  cancel: (...args: unknown[]) => Promise<unknown> = async () => ({ status: 'cancelled', outcome: 'cancelled' }),
) {
  return new ChatJobService(reader as never, { cancel } as never, bus);
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ChatJobService.follow', () => {
  it('should replay only what came after the cursor a reconnecting chat already has, then deliver new events once each', async () => {
    const reader = new FakeReader();
    reader.events.push(event(1, 'queued'), event(2, 'started'), event(3, 'step'));
    const bus = new ProjectEventService();
    const delivered: [number, string][] = [];

    const stop = serviceOver(reader, bus).follow(1n, SESSION, 1, received => (delivered.push([received.seq, received.type]), true));
    await settle();
    reader.events.push(event(4, 'done'));
    bus.publish(1n, { type: 'job', jobId: 'job-1', kind: 'organise', status: 'done' });
    bus.publish(1n, { type: 'job', jobId: 'job-1', kind: 'organise', status: 'done' });
    await settle();
    stop();

    expect(delivered).toEqual([
      [2, 'started'],
      [3, 'step'],
      [4, 'done'],
    ]);
  });

  it('should open a chat with no cursor on the bounded replay, then follow on from the cursor read with it', async () => {
    const reader = new FakeReader();
    reader.events.push(event(1, 'queued', 'old'), event(2, 'done', 'old'), event(5, 'queued'), event(6, 'started'), event(7, 'step'));
    reader.replayed = { events: [event(2, 'done', 'old'), event(5, 'queued'), event(6, 'started')], cursor: 6, activeJobIds: ['job-1'] };
    const delivered: number[] = [];

    const stop = serviceOver(reader).follow(1n, SESSION, null, received => (delivered.push(received.seq), true));
    await settle();
    stop();

    expect(delivered).toEqual([2, 5, 6, 7]);
    expect(reader.reads).toEqual([6]);
  });

  it('should stop following once its transport has closed', async () => {
    const reader = new FakeReader();
    reader.events.push(event(1, 'queued'));
    const bus = new ProjectEventService();
    const delivered: number[] = [];

    serviceOver(reader, bus).follow(1n, SESSION, 0, received => (delivered.push(received.seq), false));
    await settle();
    reader.events.push(event(2, 'started'));
    bus.publish(1n, { type: 'job', jobId: 'job-1', kind: 'organise', status: 'in_progress' });
    await settle();

    expect(delivered).toEqual([1]);
  });
});

describe('ChatJobService.follow — polling', () => {
  const flush = async (): Promise<void> => {
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  };

  it('should notice slowly, with nothing running, a job another replica started, and briskly once one runs', async () => {
    const reader = new FakeReader();
    const delivered: number[] = [];
    jest.useFakeTimers();
    try {
      const stop = serviceOver(reader).follow(1n, SESSION, 0, received => (delivered.push(received.seq), true));
      await flush();
      reader.events.push(event(1, 'queued'));
      jest.advanceTimersByTime(19_999);
      await flush();
      const beforeIdlePoll = [...delivered];
      jest.advanceTimersByTime(1);
      await flush();
      const afterIdlePoll = [...delivered];
      reader.events.push(event(2, 'started'));
      jest.advanceTimersByTime(2_000);
      await flush();
      stop();

      expect(beforeIdlePoll).toEqual([]);
      expect(afterIdlePoll).toEqual([1]);
      expect(delivered).toEqual([1, 2]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ChatJobService.cancel', () => {
  it('should cancel a job this chat started through the job service, which settles it', async () => {
    const reader = new FakeReader();
    reader.startedHere.add('job-1');
    const cancelled: unknown[][] = [];

    const result = await serviceOver(reader, undefined, async (...args) => (cancelled.push(args), { status: 'cancelled', outcome: 'cancelled' })).cancel(1n, SESSION, 'job-1');

    expect(cancelled).toEqual([['job-1', 1n]]);
    expect(result).toEqual({ status: 'cancelled', outcome: 'cancelled' });
  });

  it('should answer a job another chat started as not found, and another project’s chat as missing', async () => {
    const reader = new FakeReader();
    const cancelled: unknown[] = [];
    const service = serviceOver(reader, undefined, async (...args) => void cancelled.push(args));

    await expect(service.cancel(1n, SESSION, 'job-9')).rejects.toMatchObject({ code: 'JOB_001' });
    await expect(service.cancel(2n, SESSION, 'job-1')).rejects.toMatchObject({ code: 'CHT_001' });
    expect(cancelled).toEqual([]);
  });
});

describe('ChatJobsController', () => {
  it('should refuse a malformed cursor before it opens the stream', async () => {
    const reader = new FakeReader();
    const controller = new ChatJobsController(serviceOver(reader), reader as never);
    const params = { projectId: 1n, sessionId: SESSION };

    await expect(controller.streamEvents(params, {}, { 'last-event-id': 'seq-4' }, {} as never)).rejects.toMatchObject({ code: 'CHT_008' });
    await expect(controller.listEvents(params, { after: '12345678901' })).rejects.toMatchObject({ code: 'CHT_008' });
  });
});
