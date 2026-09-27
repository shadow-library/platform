/**
 * Importing user defined packages
 */
import { csrfHeaders, mutate } from '../../lib';
import { type ForgeActor } from './forge-actors';
import { guardedProject, newProject, quotaRefusedChat, startTurn } from './forge-arrange';
import { assertSpendGuarded, listDispatchedModelCalls } from './forge-db';
import { expect, expectRefusedStream, framesOf, type SseClient, type SseFrame, type SseStream, test } from './forge-sse';

/**
 * Defining types
 */

interface RunEvent {
  readonly type: 'run';
  readonly runId: string;
  readonly graph: string;
  readonly target: string;
  readonly status: string;
}

interface JobEvent {
  readonly type: 'job';
  readonly jobId: string;
  readonly kind: string;
  readonly status: string;
}

interface ChatEvent {
  readonly type: 'chat';
  readonly sessionId: string;
}

/**
 * Declaring the constants
 *
 * A project's event stream tells a client what to refetch. Every event here comes from model-free work: a full-novel validation over a
 * novel with no finished chapters plans no windows, a reindex of a novel with no finished prose embeds nothing, and a chat turn on a
 * quota-pinned novel stores the author's message and then fails AI_008 before any dispatch. Every project is quota-pinned all the same.
 */

async function openEvents(sse: SseClient, owner: ForgeActor, projectId: string): Promise<SseStream> {
  const stream = await sse.open(owner.ctx, `/api/v1/projects/${projectId}/events`);
  expect(stream.status, stream.body).toBe(200);
  await stream.until(frames => frames.length > 0, 'the ready frame');
  return stream;
}

function runStatuses(frames: readonly SseFrame[], runId: string): string[] {
  return framesOf<RunEvent>(frames, 'run')
    .filter(event => event.runId === runId)
    .map(event => event.status);
}

function jobStatuses(frames: readonly SseFrame[], jobId: string): string[] {
  return framesOf<JobEvent>(frames, 'job')
    .filter(event => event.jobId === jobId)
    .map(event => event.status)
    .filter((status, index, statuses) => statuses[index - 1] !== status);
}

async function validate(owner: ForgeActor, projectId: string): Promise<string> {
  await assertSpendGuarded(projectId, { requireQuota: true });
  const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/validate`);
  expect(response.status(), await response.text()).toBe(200);
  const run = (await response.json()) as { runId: string; status: string };
  expect(run.status, 'with no finished chapter the validation plans no window and completes').toBe('completed');
  return run.runId;
}

test.describe('novel-forge project event stream', () => {
  test('should open with ready and then announce runs, jobs and chat activity as they happen', async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'events' });
    const projectId = await guardedProject(forge, owner, 'events');
    const stream = await openEvents(sse, owner, projectId);
    expect(stream.frames[0], 'ready is the first frame, before any event').toEqual({ event: 'ready', data: '{}' });

    const runId = await validate(owner, projectId);
    await stream.until(frames => runStatuses(frames, runId).includes('completed'), 'the validation run to complete');
    expect(runStatuses(stream.frames, runId)).toEqual(['running', 'completed']);
    expect(framesOf<RunEvent>(stream.frames, 'run').find(event => event.runId === runId)).toEqual({
      type: 'run',
      runId,
      graph: 'novel-validation',
      target: 'full-novel',
      status: 'running',
    });

    await assertSpendGuarded(projectId, { requireQuota: true });
    const backfill = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/backfill`);
    expect(backfill.status(), await backfill.text()).toBe(202);
    const { jobId } = (await backfill.json()) as { jobId: string };
    await stream.until(frames => jobStatuses(frames, jobId).includes('done'), 'the reindex job to finish');
    expect(jobStatuses(stream.frames, jobId), 'queued, claimed and settled, in that order').toEqual(['pending', 'in_progress', 'done']);
    expect(framesOf<JobEvent>(stream.frames, 'job').every(event => event.kind === 'backfill')).toBe(true);

    const chat = await quotaRefusedChat(forge, owner, 'events-chat');
    const chatStream = await openEvents(sse, owner, chat.projectId);
    const turn = await startTurn(owner, chat.projectId, chat.sessionId);
    expect(turn.status(), await turn.text()).toBe(202);
    const { runId: turnRunId } = (await turn.json()) as { runId: string };
    await chatStream.until(frames => runStatuses(frames, turnRunId).includes('failed'), 'the quota-refused turn to fail');
    expect(runStatuses(chatStream.frames, turnRunId)).toEqual(['running', 'failed']);
    expect(framesOf<ChatEvent>(chatStream.frames, 'chat'), "the author's stored message is announced once").toEqual([{ type: 'chat', sessionId: chat.sessionId }]);
    expect(framesOf<RunEvent>(chatStream.frames, 'run')[0]).toMatchObject({ graph: 'chat-turn', target: `session:${chat.sessionId}` });
    expect(await listDispatchedModelCalls(chat.projectId), 'the turn dispatched nothing').toEqual([]);
  });

  test("should keep each project's events on its own stream", async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'events-walls' });
    const first = await guardedProject(forge, owner, 'events-first');
    const second = await guardedProject(forge, owner, 'events-second');
    const firstStream = await openEvents(sse, owner, first);
    const secondStream = await openEvents(sse, owner, second);

    await Promise.all([assertSpendGuarded(first, { requireQuota: true }), assertSpendGuarded(second, { requireQuota: true })]);
    const headers = await csrfHeaders(owner.ctx);
    const [firstRun, secondRun] = await Promise.all(
      [first, second].map(async projectId => {
        const response = await owner.ctx.post(`/api/v1/projects/${projectId}/validate`, { headers });
        expect(response.status(), await response.text()).toBe(200);
        return ((await response.json()) as { runId: string }).runId;
      }),
    );

    await firstStream.until(frames => runStatuses(frames, firstRun ?? '').includes('completed'), "the first project's run");
    await secondStream.until(frames => runStatuses(frames, secondRun ?? '').includes('completed'), "the second project's run");
    expect(framesOf<RunEvent>(firstStream.frames, 'run').map(event => event.runId)).toEqual([firstRun, firstRun]);
    expect(framesOf<RunEvent>(secondStream.frames, 'run').map(event => event.runId)).toEqual([secondRun, secondRun]);
  });

  test("should refuse a project's stream to anyone but its owner", async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'events-owner' });
    const stranger = await forge.actor({ label: 'events-stranger' });
    const projectId = await newProject(owner, 'events-private');
    const path = `/api/v1/projects/${projectId}/events`;

    expectRefusedStream(await sse.open(stranger.ctx, path), 404, 'PRJ_001', 'another user opening the stream');
    expectRefusedStream(await sse.open(await forge.anonymous(), path), 401, 'IAM_001', 'an anonymous caller opening the stream');
    expectRefusedStream(await sse.open(owner.ctx, '/api/v1/projects/999999999999/events'), 404, 'PRJ_001', 'the owner on a project that does not exist');

    const own = await openEvents(sse, owner, projectId);
    expect(own.frames[0]).toEqual({ event: 'ready', data: '{}' });
  });
});
