import { eq } from 'drizzle-orm';
import { Config } from '@shadow-library/common';
import { type SynapseEnvelope, type SynapseSubject } from '@shadow-library/synapse';
import { type SynapseRequestHook } from '@shadow-library/synapse/langchain';

import { AppErrorCode } from '@server/classes';
import { type OwnedRow } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

import { type AiRole, type ModelGroup, ROLE_GROUP } from './defaults';
import { type RequestGuard } from './hard-line';
import { type ModelRoute } from './model-router.service';

const TASK_PREFIX = 'novel-forge.';

export const SYNAPSE_CHAT_TASK = `${TASK_PREFIX}chat`;

export const SYNAPSE_IMAGE_TASK = `${TASK_PREFIX}image`;

/** Pinned, because stored vectors depend on its model: a different embedder is a new task id, and moving to it means re-indexing, never mixing. */
export const SYNAPSE_EMBEDDING_TASK = `${TASK_PREFIX}embedding`;

/** Where a record names Synapse rather than a provider: an alias option, whose key is the model, or a call that never answered. */
export const SYNAPSE_PROVIDER = 'synapse';

/** Every project without an owner shares one subject. */
export const UNOWNED_SUBJECT: SynapseSubject = { type: 'owner', id: 'unowned' };

export function synapseGroupTask(group: ModelGroup): string {
  return `${TASK_PREFIX}${group}`;
}

/** Image and embedding calls never reach a chat model, so their groups have no chat task. */
export function synapseChatTask(role: AiRole): string {
  const group = ROLE_GROUP[role];
  if (!group || group === 'image' || group === 'embedding') throw AppErrorCode.AI_002.create();
  return synapseGroupTask(group);
}

export function synapseTask(role: AiRole): string {
  if (role === 'image') return SYNAPSE_IMAGE_TASK;
  if (role === 'embedding') return SYNAPSE_EMBEDDING_TASK;
  return synapseChatTask(role);
}

/**
 * Names the conversation a chat call continues, sent as the envelope's `session`: Synapse forwards it only to a deployment that keeps
 * sessions, which then resumes its own conversation and is sent only the new messages. Dev and prod share one host gateway, so the stage
 * keeps their conversations apart.
 */
export function gatewaySessionKey(projectId: bigint, chatSessionId: string): string {
  return `${Config.get('app.stage')}:${projectId}:${chatSessionId}`;
}

export function synapseSelectors({ costTier, contentMode }: Pick<ModelRoute, 'costTier' | 'contentMode'>): Record<string, string> {
  return { tier: costTier, content_mode: contentMode };
}

/** An unrestricted call is strict on its content mode, so Synapse refuses it rather than sending it to a task's selector-less default route. */
export function synapseRouting(route: Pick<ModelRoute, 'costTier' | 'contentMode'>): Pick<SynapseEnvelope, 'selectors' | 'strict'> {
  return { selectors: synapseSelectors(route), ...(route.contentMode === 'unrestricted' ? { strict: ['content_mode'] } : {}) };
}

export function ownerSubject(owner: OwnedRow | undefined): SynapseSubject {
  if (!owner || owner.ownerId === null) return UNOWNED_SUBJECT;
  return { type: 'owner', id: `${owner.ownerKind}:${owner.ownerId}` };
}

/** The owner whose Synapse budget a call on the project spends. */
export async function projectSubject(db: PrimaryDatabase, projectId: bigint): Promise<SynapseSubject> {
  const owner = await db.query.projects.findFirst({ columns: { ownerKind: true, ownerId: true }, where: eq(schema.projects.id, projectId) });
  return ownerSubject(owner);
}

export function guardRequestHook(guard: RequestGuard): SynapseRequestHook {
  return request => {
    guard.screen(request.messages);
    return { ...request, messages: [{ role: 'system', content: guard.systemLine }, ...request.messages] } as typeof request;
  };
}
