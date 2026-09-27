/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, pollUntil } from '../../lib';
import { type ForgeActor } from './forge-actors';
import { expectCode, guardedProject, newChatSession, newProject, quotaRefusedChat, SHORT_TURN, startTurn } from './forge-arrange';
import { listDispatchedModelCalls } from './forge-db';
import { type ChatTranscript, HAIKU_MODEL } from './forge-helpers';
import { holdNextChatMessage, listWorkflowRuns } from './forge-rows';
import { expect, expectRefusedStream, framesOf, type SseClient, type SseFrame, type SseStream, test } from './forge-sse';

/**
 * Declaring the constants
 *
 * The chat turn stream: the POST starts a turn and answers with its run id, and `GET /turns/:runId/stream` replays what the run has emitted
 * so far and follows it live until its terminal frame. A turn is refused before its run exists when it cannot even be routed, and fails on
 * the stream once it has one. Every turn here runs on a quota-pinned owner, so a routed turn fails AI_008 before dispatch and nothing is
 * spent; the buffer is dropped once a finished run's last stream closes.
 */

const TURN_FRAMES = ['ready', 'reset', 'user', 'error'];

function turnPath(projectId: string, runId: string): string {
  return `/api/v1/projects/${projectId}/turns/${runId}/stream`;
}

async function startedRun(owner: ForgeActor, projectId: string, sessionId: string): Promise<string> {
  const response = await startTurn(owner, projectId, sessionId);
  expect(response.status(), await response.text()).toBe(202);
  return ((await response.json()) as { runId: string }).runId;
}

async function transcript(ctx: APIRequestContext, projectId: string, sessionId: string): Promise<ChatTranscript> {
  const response = await ctx.get(`/api/v1/projects/${projectId}/chat/sessions/${sessionId}/messages`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as ChatTranscript;
}

async function watchToTheEnd(sse: SseClient, owner: ForgeActor, projectId: string, runId: string): Promise<readonly SseFrame[]> {
  const stream = await sse.open(owner.ctx, turnPath(projectId, runId));
  expect(stream.status, stream.body).toBe(200);
  return stream.ended();
}

function expectQuotaRefusedTurn(frames: readonly SseFrame[]): void {
  expect(frames.map(frame => frame.event)).toEqual(TURN_FRAMES);
  expect(framesOf<{ role: string; content: string }>(frames, 'user')).toEqual([expect.objectContaining({ role: 'user', content: SHORT_TURN })]);
  expect(framesOf<{ code: string }>(frames, 'error')).toEqual([expect.objectContaining({ code: 'AI_008' })]);
}

test.describe('novel-forge chat turn stream', () => {
  test('should refuse a turn before its run exists, and start one once the chat is pinned to a routable model', async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'turn-refused' });
    const projectId = await guardedProject(forge, owner, 'turn-refused');
    const sessionId = await newChatSession(owner, projectId);

    await expectCode(await startTurn(owner, projectId, sessionId), 400, 'AI_002', 'a chat whose model cannot be routed');
    expect(await listWorkflowRuns(projectId, 'chat-turn'), 'the refused turn opened no run').toEqual([]);
    expect((await transcript(owner.ctx, projectId, sessionId)).messages, 'and stored no message').toEqual([]);

    const archive = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/archive`);
    expect(archive.status(), await archive.text()).toBe(200);
    await expectCode(await startTurn(owner, projectId, sessionId), 400, 'CHT_002', 'an archived chat');
    const unarchive = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/unarchive`);
    expect(unarchive.status(), await unarchive.text()).toBe(200);
    await expectCode(await startTurn(owner, projectId, randomUUID()), 404, 'CHT_001', 'a chat that does not exist');

    const pinned = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/model`, { data: HAIKU_MODEL });
    expect(pinned.status(), await pinned.text()).toBe(200);
    const runId = await startedRun(owner, projectId, sessionId);
    expectQuotaRefusedTurn(await watchToTheEnd(sse, owner, projectId, runId));
    expect(await listDispatchedModelCalls(projectId), "the chat's own pin outranks the project's, and the quota still refused it").toEqual([]);
  });

  test('should deliver the same live frames to every subscriber of a running turn', async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'turn-live' });
    const chat = await quotaRefusedChat(forge, owner, 'turn-live');
    const release = await holdNextChatMessage(chat.projectId, chat.sessionId);

    let runId = '';
    const subscribers: SseStream[] = [];
    try {
      runId = await startedRun(owner, chat.projectId, chat.sessionId);
      const running = await transcript(owner.ctx, chat.projectId, chat.sessionId);
      expect(running.pendingTurn?.runId, 'the run id is known before the turn settles').toBe(runId);

      const subscribe = async (): Promise<SseStream> => {
        const stream = await sse.open(owner.ctx, turnPath(chat.projectId, runId));
        expect(stream.status, stream.body).toBe(200);
        await stream.until(frames => frames.length >= 2, 'the replay of an empty backlog');
        return stream;
      };
      subscribers.push(await subscribe(), await subscribe());
      for (const stream of subscribers)
        expect(
          stream.frames.map(frame => frame.event),
          'nothing has happened yet but the opening reset',
        ).toEqual(['ready', 'reset']);
    } finally {
      await release();
    }

    const [first, second] = await Promise.all(subscribers.map(stream => stream.ended()));
    expectQuotaRefusedTurn(first ?? []);
    expect(second, 'both subscribers saw the same frames').toEqual(first);
    expectRefusedStream(await sse.open(owner.ctx, turnPath(chat.projectId, runId)), 404, 'CHT_007', 'the finished run once its last stream closed');
    expect(await listDispatchedModelCalls(chat.projectId)).toEqual([]);
  });

  test('should replay a finished turn once to its owner, and never to another project or a stranger', async ({ forge, sse }) => {
    const owner = await forge.actor({ label: 'turn-replay' });
    const stranger = await forge.actor({ label: 'turn-stranger' });
    const chat = await quotaRefusedChat(forge, owner, 'turn-replay');
    const sibling = await newProject(owner, 'turn-sibling');

    expectRefusedStream(await sse.open(owner.ctx, turnPath(chat.projectId, randomUUID())), 404, 'CHT_007', 'a run id no turn has');

    const runId = await startedRun(owner, chat.projectId, chat.sessionId);
    const settled = await pollUntil(
      () => transcript(owner.ctx, chat.projectId, chat.sessionId),
      current => !current.pendingTurn && !!current.failedTurn,
      { timeoutMs: 15_000, intervalMs: 250 },
    );
    expect(settled.failedTurn, 'the transcript reports the failed turn').toMatchObject({ status: 'failed', code: 'AI_008' });
    expect(
      settled.messages.map(message => message.role),
      'only the author’s message was stored',
    ).toEqual(['user']);

    expectRefusedStream(await sse.open(owner.ctx, turnPath(sibling, runId)), 404, 'CHT_007', "the run through the owner's other project");
    expectRefusedStream(await sse.open(stranger.ctx, turnPath(chat.projectId, runId)), 404, 'PRJ_001', 'a stranger on the run');
    expectRefusedStream(await sse.open(await forge.anonymous(), turnPath(chat.projectId, runId)), 401, 'IAM_001', 'an anonymous caller on the run');

    expectQuotaRefusedTurn(await watchToTheEnd(sse, owner, chat.projectId, runId));
    expectRefusedStream(await sse.open(owner.ctx, turnPath(chat.projectId, runId)), 404, 'CHT_007', 'the run after its replay was watched to the end');
    expect(await listDispatchedModelCalls(chat.projectId)).toEqual([]);
  });
});
