/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode, guardedProject, newChatSession, newProject } from './forge-arrange';
import { assertSpendGuarded, failPin, insertWorkflowRun } from './forge-db';
import { insertChatMessage, insertChatSession, settleWorkflowRun } from './forge-bible';
import { listWorkflowRuns } from './forge-rows';
import { HAIKU_MODEL } from './forge-helpers';

/**
 * Defining types
 */

interface ChatSession {
  id: string;
  scopeType: string;
  mode: string;
  status: string;
  title: string | null;
  modelProvider: string | null;
  modelId: string | null;
}

interface ChatTurnStatus {
  pendingTurn: { runId: string; graph: string } | null;
  failedTurn: { runId: string; status: string; code: string | null } | null;
  lastOrdinal: number;
}

/**
 * Declaring the constants
 *
 * Chat sessions without a model: creation/CRUD, model pin validation, archive/unarchive/delete, and the turn
 * status a client polls (`pendingTurn`/`failedTurn`), derived from `workflow_runs` rows seeded directly so the
 * deterministic halves need no live turn. The two genuinely model-capable routes here (`turn/stream`,
 * `premise/enhance`) are exercised only on their pre-dispatch refusals, every project quota-pinned first even
 * though each refusal fires before routing, per the spend rules.
 */

async function turnStatus(ctx: APIRequestContext, projectId: string, sessionId: string): Promise<ChatTurnStatus> {
  const response = await ctx.get(`/api/v1/projects/${projectId}/chat/sessions/${sessionId}/turn`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as ChatTurnStatus;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    await assertSpendGuarded(projectId, { requireQuota: true });
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

    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chats/${sessionId}/turn/stream`, { data: { content: 'Hello' } }),
      400,
      'CHT_003',
      'starting a turn scoped to a volume that does not exist',
    );
  });

  test('should validate a model pin, and clear it back to the default with both fields null', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chat-model' });
    const projectId = await newProject(owner, 'chat-model');
    const sessionId = await newChatSession(owner, projectId);

    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/model`, { data: { provider: 'openrouter', model: 'e2e/unregistered' } }),
      400,
      'AI_002',
      'pinning an unregistered model',
    );

    const pinned = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/model`, {
      data: { provider: HAIKU_MODEL.provider, model: HAIKU_MODEL.model },
    });
    expect(pinned.status(), await pinned.text()).toBe(200);
    const pinnedSession = (await pinned.json()) as ChatSession;
    expect(pinnedSession.modelProvider).toBe(HAIKU_MODEL.provider);
    expect(pinnedSession.modelId).toBe(HAIKU_MODEL.model);

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

    // Settle the still-`running` row before moving on — `insertWorkflowRun` leaves a `running` run open forever
    // (no `endedAgoMs`), and `turnStatus`'s pendingTurn query would keep finding it as the newest running run.
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

  test('should refuse a turn and a premise enhancement before any model dispatch, on a fully guarded project', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chat-guard' });
    const projectId = await newProject(owner, 'chat-guard');
    await forge.quotaPin(projectId);
    await failPin(projectId);
    const sessionId = await newChatSession(owner, projectId);

    const beforeTitleRuns = await listWorkflowRuns(projectId, 'chat-title');
    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chats/${sessionId}/turn/stream`, { data: { content: 'Hello there' } }),
      400,
      'AI_002',
      'a fail-pinned chat role refuses the POST before a run id is minted',
    );
    // Poll briefly rather than checking once immediately after: proves no background `chat-title` run appears even
    // a short moment later, not merely that none had landed yet at the instant of the first read.
    for (let attempt = 0; attempt < 3; attempt++) {
      await delay(150);
      const afterTitleRuns = await listWorkflowRuns(projectId, 'chat-title');
      expect(afterTitleRuns.length, 'no background chat-title run starts on a refused turn').toBe(beforeTitleRuns.length);
    }

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/premise/enhance`, { data: {} }),
      400,
      'PRM_001',
      'enhancing a premise with no overview, brief or premise',
    );
  });
});
