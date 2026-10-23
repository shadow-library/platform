import { type APIRequestContext } from '@playwright/test';

import { mutate } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode, guardedProject, newChatSession, newProject } from './forge-arrange';
import { assertSpendGuarded, insertWorkflowRun, listDispatchedModelCalls } from './forge-db';
import { insertChatMessage, insertChatSession, settleWorkflowRun } from './forge-bible';
import { listWorkflowRuns } from './forge-rows';
import { HAIKU_ALIAS } from './forge-helpers';

interface ChatSession {
  id: string;
  scopeType: string;
  mode: string;
  status: string;
  title: string | null;
  modelProvider: string | null;
  modelId: string | null;
  contentMode: string | null;
}

interface ChatTurnStatus {
  pendingTurn: { runId: string; graph: string } | null;
  failedTurn: { runId: string; status: string; code: string | null } | null;
  lastOrdinal: number;
}

/**
 * Chat sessions without a model: CRUD, model pin validation, archive/unarchive/delete, and the turn status a client polls (`pendingTurn`/`failedTurn`) derived from seeded
 * `workflow_runs` rows. The model-capable routes (`turn/stream`, `premise/enhance`) are exercised only on pre-dispatch refusals, with every project quota-pinned first.
 */

async function turnStatus(ctx: APIRequestContext, projectId: string, sessionId: string): Promise<ChatTurnStatus> {
  const response = await ctx.get(`/api/v1/projects/${projectId}/chat/sessions/${sessionId}/turn`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as ChatTurnStatus;
}

test.describe('novel-forge chat sessions', () => {
  test('should create a project-scope session in auto mode, update its title, and CRUD its lifecycle', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chat-crud' });
    const projectId = await guardedProject(forge, owner, 'chat-crud');

    const created = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions`, { data: {} });
    expect(created.status(), await created.text()).toBe(201);
    const session = (await created.json()) as ChatSession;
    expect(session).toMatchObject({ scopeType: 'project', mode: 'auto', status: 'active', title: null });

    const retitled = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/chat/sessions/${session.id}`, { data: { title: 'Working title' } });
    expect(retitled.status(), await retitled.text()).toBe(200);
    expect(((await retitled.json()) as ChatSession).title).toBe('Working title');

    const archived = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions/${session.id}/archive`);
    expect(archived.status(), await archived.text()).toBe(200);
    expect(((await archived.json()) as ChatSession).status).toBe('archived');

    await assertSpendGuarded(projectId);
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chats/${session.id}/turn/stream`, { data: { content: 'Hello' } }),
      400,
      'CHT_002',
      'starting a turn on an archived session',
    );

    const unarchived = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions/${session.id}/unarchive`);
    expect(unarchived.status(), await unarchived.text()).toBe(200);
    expect(((await unarchived.json()) as ChatSession).status).toBe('active');

    const deleted = await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/chat/sessions/${session.id}`);
    expect(deleted.status(), await deleted.text()).toBe(200);
    const afterDelete = await owner.ctx.get(`/api/v1/projects/${projectId}/chat/sessions/${session.id}`);
    await expectCode(afterDelete, 404, 'CHT_001', 'reading a deleted session');
  });

  test('should refuse a turn on a session whose scope reference no longer resolves', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chat-scope' });
    const projectId = await guardedProject(forge, owner, 'chat-scope');
    const sessionId = await insertChatSession(projectId, 'volume', 'volume:does-not-exist');

    await assertSpendGuarded(projectId);
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chats/${sessionId}/turn/stream`, { data: { content: 'Hello' } }),
      400,
      'CHT_003',
      'starting a turn scoped to a volume that does not exist',
    );
  });

  test('should pin a chat to an alias, refuse a registry slug, and clear the pin back to the default with both fields null', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chat-model' });
    const projectId = await newProject(owner, 'chat-model');
    const sessionId = await newChatSession(owner, projectId);

    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/model`, { data: { provider: 'openrouter', model: 'e2e/unregistered' } }),
      400,
      'AI_002',
      'pinning a registry slug, which is not a Synapse alias',
    );

    const pinned = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/model`, { data: HAIKU_ALIAS });
    expect(pinned.status(), await pinned.text()).toBe(200);
    const pinnedSession = (await pinned.json()) as ChatSession;
    expect(pinnedSession.modelProvider).toBe('synapse');
    expect(pinnedSession.modelId).toBe('haiku');

    const cleared = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/model`, { data: { provider: null, model: null } });
    expect(cleared.status(), await cleared.text()).toBe(200);
    const clearedSession = (await cleared.json()) as ChatSession;
    expect(clearedSession.modelProvider).toBeNull();
    expect(clearedSession.modelId).toBeNull();
  });

  test('should derive pendingTurn and failedTurn from seeded workflow runs, hiding a cancelled run once a newer message exists', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chat-turn-status' });
    const projectId = await newProject(owner, 'chat-turn-status');
    const sessionId = await newChatSession(owner, projectId);

    const runningId = await insertWorkflowRun({ projectId, graph: 'chat-turn', target: `session:${sessionId}`, status: 'running', startedAgoMs: 2_000 });
    const running = await turnStatus(owner.ctx, projectId, sessionId);
    expect(running.pendingTurn?.runId).toBe(runningId);
    expect(running.failedTurn, 'a run still reads as pending, not failed').toBeNull();

    // Settle the `running` row first: `insertWorkflowRun` leaves a run without `endedAgoMs` open forever and `turnStatus` would keep finding it as the newest.
    await settleWorkflowRun(runningId, 'completed');
    await insertWorkflowRun({ projectId, graph: 'chat-turn', target: `session:${sessionId}`, status: 'completed', startedAgoMs: 2_000, endedAgoMs: 1_000 });

    const failedId = await insertWorkflowRun({
      projectId,
      graph: 'chat-turn',
      target: `session:${sessionId}`,
      status: 'failed',
      error: { code: 'AI_008', message: 'the AI call ceiling was reached' },
      startedAgoMs: 500,
    });
    await insertChatMessage({ projectId, sessionId, role: 'user', content: 'A message the failed run answered.', runId: failedId });

    const failed = await turnStatus(owner.ctx, projectId, sessionId);
    expect(failed.pendingTurn).toBeNull();
    expect(failed.failedTurn).toMatchObject({ runId: failedId, status: 'failed', code: 'AI_008' });

    const cancelledId = await insertWorkflowRun({ projectId, graph: 'chat-turn', target: `session:${sessionId}`, status: 'cancelled', startedAgoMs: 200 });
    await insertChatMessage({ projectId, sessionId, role: 'user', content: 'A message the cancelled run answered.', runId: cancelledId });

    const cancelled = await turnStatus(owner.ctx, projectId, sessionId);
    expect(cancelled.failedTurn).toMatchObject({ runId: cancelledId, status: 'cancelled', code: null });

    await insertChatMessage({ projectId, sessionId, role: 'user', content: 'A newer message the author sent after the cancellation.', runId: null });
    const afterNewerMessage = await turnStatus(owner.ctx, projectId, sessionId);
    expect(afterNewerMessage.failedTurn, 'a cancelled run is hidden once a newer user message exists').toBeNull();
    expect(afterNewerMessage.lastOrdinal).toBeGreaterThan(0);
  });

  test('should refuse a pin to an alias the catalog does not offer, so no turn runs on it, and a premise enhancement before any model dispatch', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chat-guard' });
    const projectId = await newProject(owner, 'chat-guard');
    await forge.quotaPin(projectId);
    const sessionId = await newChatSession(owner, projectId);
    const pinPath = `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/model`;

    await expectCode(await mutate(owner.ctx, 'patch', pinPath, { data: { provider: 'synapse', model: 'e2e-unoffered' } }), 400, 'AI_022', 'pinning an alias the catalog lacks');
    await expectCode(
      await mutate(owner.ctx, 'patch', pinPath, { data: { ...HAIKU_ALIAS, contentMode: 'unrestricted' } }),
      400,
      'AI_022',
      'pinning a standard-only alias on a chat turned unrestricted in the same update',
    );
    const session = await owner.ctx.get(`/api/v1/projects/${projectId}/chat/sessions/${sessionId}`);
    expect(session.status(), await session.text()).toBe(200);
    expect((await session.json()) as ChatSession, 'a refused pin writes nothing, the model type included').toMatchObject({ modelProvider: null, modelId: null, contentMode: null });
    expect(await listWorkflowRuns(projectId, 'chat-turn'), 'no turn was dispatched for the refused pin').toEqual([]);
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);

    await assertSpendGuarded(projectId);
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/premise/enhance`, { data: {} }),
      400,
      'PRM_001',
      'enhancing a premise with no overview, brief or premise',
    );
  });
});
