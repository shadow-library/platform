/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { type ForgeActor } from './forge-actors';
import { expectCode, newChatSession, newProject } from './forge-arrange';
import { insertJob } from './forge-db';
import { appendJobEvents, chatOrigin, readJobRow } from './forge-rows';
import { expect, expectRefusedStream, framesOf, type SseClient, type SseFrame, type SseStream, test } from './forge-sse';

/**
 * Defining types
 */

interface JobEventBody {
  readonly seq: number;
  readonly jobId: string;
  readonly kind: string;
  readonly type: string;
}

interface ChatJobs {
  readonly items: { id: string; status: string }[];
  readonly cursor: number;
}

interface ArrangedChat {
  readonly projectId: string;
  readonly sessionId: string;
  /** Queued, started and finished within the hour: events 1–3. */
  readonly finished: string;
  /** Still queued: event 4. */
  readonly queued: string;
}

/**
 * Declaring the constants
 *
 * The jobs a chat started, and the stream that follows them. A job belongs to a chat through the origin on its payload, and each transition
 * it makes is logged against that chat with the next `seq`, which is the stream's event id. Opened without a cursor the stream replays only
 * the running jobs' events and how each recently settled job ended; with `Last-Event-ID` (or `after`) it resumes after that seq. The
 * arranged jobs are reindex jobs, which only run when something dispatches them, so they sit still while the spec reads them.
 */

function chatPath(projectId: string, sessionId: string, suffix = ''): string {
  return `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/jobs${suffix}`;
}

async function chatJob(projectId: string, sessionId: string | null, target: string, status: 'pending' | 'done'): Promise<string> {
  return insertJob({ projectId, kind: 'backfill', target, status, payload: sessionId ? chatOrigin(sessionId) : null });
}

async function arrangeChat(owner: ForgeActor, label: string): Promise<ArrangedChat> {
  const projectId = await newProject(owner, label);
  const sessionId = await newChatSession(owner, projectId);
  const finished = await chatJob(projectId, sessionId, 'e2e-finished', 'done');
  const queued = await chatJob(projectId, sessionId, 'e2e-queued', 'pending');
  await appendJobEvents(projectId, sessionId, [
    { jobId: finished, type: 'queued' },
    { jobId: finished, type: 'started', data: { attempt: 1 } },
    { jobId: finished, type: 'done' },
    { jobId: queued, type: 'queued' },
  ]);
  return { projectId, sessionId, finished, queued };
}

function eventIds(frames: readonly SseFrame[]): string[] {
  return frames.filter(frame => frame.event === 'job').map(frame => frame.id ?? '');
}

async function followJobs(sse: SseClient, ctx: APIRequestContext, chat: ArrangedChat, count: number, options: { query?: string; lastEventId?: string } = {}): Promise<SseStream> {
  const stream = await sse.open(ctx, chatPath(chat.projectId, chat.sessionId, `/stream${options.query ?? ''}`), {
    headers: options.lastEventId === undefined ? {} : { 'last-event-id': options.lastEventId },
  });
  expect(stream.status, stream.body).toBe(200);
  await stream.until(frames => eventIds(frames).length >= count, `${count} job events`);
  return stream;
}

async function listEvents(ctx: APIRequestContext, chat: ArrangedChat, query = ''): Promise<number[]> {
  const response = await ctx.get(chatPath(chat.projectId, chat.sessionId, `/events${query}`));
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { items: JobEventBody[] }).items.map(item => item.seq);
}

async function cancel(ctx: APIRequestContext, projectId: string, sessionId: string, jobId: string): Promise<APIResponse> {
  return mutate(ctx, 'post', chatPath(projectId, sessionId, `/${jobId}/cancel`));
}

test.describe("novel-forge a chat's job stream", () => {
  test('should replay running jobs and recent endings, resume after a cursor, and follow a cancel live', async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'chat-jobs' });
    const chat = await arrangeChat(owner, 'chat-jobs');

    const fresh = await followJobs(sse, owner.ctx, chat, 2);
    expect(fresh.frames[0], 'ready comes first').toEqual({ event: 'ready', data: '{}' });
    expect(eventIds(fresh.frames), "the finished job's ending and the queued job's history, not the whole log").toEqual(['3', '4']);
    expect(framesOf<JobEventBody>(fresh.frames, 'job')).toEqual([
      expect.objectContaining({ seq: 3, jobId: chat.finished, kind: 'backfill', type: 'done' }),
      expect.objectContaining({ seq: 4, jobId: chat.queued, kind: 'backfill', type: 'queued' }),
    ]);

    expect(eventIds((await followJobs(sse, owner.ctx, chat, 2, { lastEventId: '2' })).frames), 'a reconnect resumes after Last-Event-ID').toEqual(['3', '4']);
    expect(eventIds((await followJobs(sse, owner.ctx, chat, 3, { query: '?after=1' })).frames), '`after` stands in for the header').toEqual(['2', '3', '4']);
    expect(eventIds((await followJobs(sse, owner.ctx, chat, 1, { query: '?after=0', lastEventId: '3' })).frames), 'the header wins over `after`').toEqual(['4']);

    expect(await listEvents(owner.ctx, chat), 'the JSON read replays the same bounded window').toEqual([3, 4]);
    expect(await listEvents(owner.ctx, chat, '?after=1')).toEqual([2, 3, 4]);
    const listed = await owner.ctx.get(chatPath(chat.projectId, chat.sessionId));
    expect(listed.status(), await listed.text()).toBe(200);
    const jobs = (await listed.json()) as ChatJobs;
    expect(
      jobs.items.map(job => job.id),
      'the running job and the one that settled within the hour',
    ).toEqual([chat.finished, chat.queued]);
    expect(jobs.cursor, 'the cursor to follow the list from').toBe(4);

    const live = await followJobs(sse, owner.ctx, chat, 0, { lastEventId: '4' });
    const cancelled = await cancel(owner.ctx, chat.projectId, chat.sessionId, chat.queued);
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    expect(await cancelled.json()).toEqual({ jobId: chat.queued, status: 'cancelled', outcome: 'cancelled' });
    await live.until(frames => eventIds(frames).includes('5'), 'the cancel to reach the open stream');
    expect(framesOf<JobEventBody>(live.frames, 'job')).toEqual([expect.objectContaining({ seq: 5, jobId: chat.queued, type: 'cancelled' })]);
    expect((await readJobRow(chat.queued))?.status).toBe('cancelled');
  });

  test("should refuse a bad cursor, another chat's jobs and a stranger", async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'chat-jobs-walls' });
    const stranger = await forge.actor({ label: 'chat-jobs-stranger' });
    const chat = await arrangeChat(owner, 'chat-jobs-walls');
    const otherChat = await newChatSession(owner, chat.projectId);
    const fromOtherChat = await chatJob(chat.projectId, otherChat, 'e2e-other-chat', 'pending');
    const otherProject = await newProject(owner, 'chat-jobs-other');
    const otherProjectChat = await newChatSession(owner, otherProject);
    const fromOtherProject = await chatJob(otherProject, otherProjectChat, 'e2e-other-project', 'pending');

    expectRefusedStream(
      await sse.open(owner.ctx, chatPath(chat.projectId, chat.sessionId, '/stream'), { headers: { 'last-event-id': 'abc' } }),
      400,
      'CHT_008',
      'a Last-Event-ID that is not a seq',
    );
    const badAfter = await owner.ctx.get(chatPath(chat.projectId, chat.sessionId, '/events?after=abc'));
    expect(badAfter.status(), `an \`after\` that is not a seq — body ${await badAfter.text()}`).toBe(422);

    expectRefusedStream(await sse.open(owner.ctx, chatPath(chat.projectId, otherProjectChat, '/stream')), 404, 'CHT_001', "another project's chat on the stream");
    await expectCode(await owner.ctx.get(chatPath(chat.projectId, otherProjectChat)), 404, 'CHT_001', "another project's chat on the list");
    await expectCode(await owner.ctx.get(chatPath(chat.projectId, otherProjectChat, '/events')), 404, 'CHT_001', "another project's chat on the event read");
    await expectCode(await cancel(owner.ctx, chat.projectId, chat.sessionId, fromOtherChat), 404, 'JOB_001', 'a job another chat started');
    await expectCode(await cancel(owner.ctx, chat.projectId, chat.sessionId, fromOtherProject), 404, 'JOB_001', "a job of the owner's other project");

    expectRefusedStream(await sse.open(stranger.ctx, chatPath(chat.projectId, chat.sessionId, '/stream')), 404, 'PRJ_001', 'a stranger on the stream');
    await expectCode(await stranger.ctx.get(chatPath(chat.projectId, chat.sessionId)), 404, 'PRJ_001', 'a stranger on the list');
    await expectCode(await cancel(stranger.ctx, chat.projectId, chat.sessionId, chat.queued), 404, 'PRJ_001', 'a stranger cancelling');
    expectRefusedStream(await sse.open(await forge.anonymous(), chatPath(chat.projectId, chat.sessionId, '/stream')), 401, 'IAM_001', 'an anonymous caller on the stream');

    for (const jobId of [fromOtherChat, fromOtherProject, chat.queued]) expect((await readJobRow(jobId))?.status, 'no refused cancel touched a job').toBe('pending');
    const own = await cancel(owner.ctx, chat.projectId, otherChat, fromOtherChat);
    expect(own.status(), `the chat that started a job still cancels it — body ${await own.text()}`).toBe(200);
    expect((await readJobRow(fromOtherChat))?.status).toBe('cancelled');
  });
});
