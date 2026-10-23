import { type APIResponse } from '@playwright/test';

import { mutate } from '../../lib';
import { expect, type ForgeActor, type ForgeHarness } from './forge-actors';
import { assertSpendGuarded } from './forge-db';
import { errorCode, uniqueSuffix } from './forge-helpers';

export interface QuotaRefusedChat {
  readonly projectId: string;
  readonly sessionId: string;
}

/**
 * Declaring the constants
 *
 * Request-side arrangers the stream, job, isolation and plugin specs share: owner-created projects and chats, and the spend guards each
 * novel starts with.
 */

/** Kept under the length at which a session's first message is sent to a model for a title. */
export const SHORT_TURN = 'Hello';

export async function expectCode(response: APIResponse, status: number, code: string, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(status);
  expect(await errorCode(response), what).toBe(code);
}

export async function newProject(owner: ForgeActor, label: string): Promise<string> {
  const response = await mutate(owner.ctx, 'post', '/api/v1/projects', { data: { name: `e2e-forge-${label}-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** A standard novel whose owner stands at the call ceiling. */
export async function guardedProject(forge: ForgeHarness, owner: ForgeActor, label: string): Promise<string> {
  const projectId = await newProject(owner, label);
  await forge.quotaPin(projectId);
  return projectId;
}

export async function newChatSession(owner: ForgeActor, projectId: string): Promise<string> {
  const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions`, { data: {} });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/**
 * A chat whose replies route to a real model while its owner stands at the call ceiling: a turn starts and answers with its run id, then
 * fails AI_008 before any dispatch.
 */
export async function quotaRefusedChat(forge: ForgeHarness, owner: ForgeActor, label: string): Promise<QuotaRefusedChat> {
  const projectId = await newProject(owner, label);
  await forge.quotaPin(projectId);
  return { projectId, sessionId: await newChatSession(owner, projectId) };
}

export async function startTurn(owner: ForgeActor, projectId: string, sessionId: string): Promise<APIResponse> {
  await assertSpendGuarded(projectId);
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chats/${sessionId}/turn/stream`, { data: { content: SHORT_TURN } });
}
