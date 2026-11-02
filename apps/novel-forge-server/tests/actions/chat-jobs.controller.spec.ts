import { describe, expect, it } from 'bun:test';

import { type ChatJobReader } from '@modules/actions/chat-job.reader';
import { type ChatJobService } from '@modules/actions/chat-job.service';
import { ChatJobsController } from '@modules/actions/chat-jobs.controller';

const SESSION = '11111111-1111-4111-8111-111111111111';
const EVENT = { seq: 3, jobId: 'job-1', kind: 'organise', type: 'step', data: null, createdAt: new Date(0) };

function controllerOver() {
  const reads: string[] = [];
  const reader = {
    sessionCursor: async () => (reads.push('session'), 12),
    replay: async () => (reads.push('replay'), { events: [EVENT], cursor: 12, activeJobIds: [] }),
    eventsAfter: async () => (reads.push('after'), [EVENT]),
  };
  return { controller: new ChatJobsController({} as ChatJobService, reader as unknown as ChatJobReader), reads };
}

describe('ChatJobsController.listEvents', () => {
  it('should let the replay check the session itself rather than reading it twice', async () => {
    const { controller, reads } = controllerOver();

    const listed = await controller.listEvents({ projectId: 1n, sessionId: SESSION } as never, {} as never);

    expect(listed.items.map(item => item.seq)).toEqual([3]);
    expect(reads).toEqual(['replay']);
  });

  it('should check the session before reading the events after a cursor', async () => {
    const { controller, reads } = controllerOver();

    await controller.listEvents({ projectId: 1n, sessionId: SESSION } as never, { after: '2' } as never);

    expect(reads).toEqual(['session', 'after']);
  });
});
