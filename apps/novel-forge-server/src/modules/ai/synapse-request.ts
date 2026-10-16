import { type SynapseSubject } from '@shadow-library/synapse';
import { type SynapseRequestHook } from '@shadow-library/synapse/langchain';

import { AppErrorCode } from '@server/classes';
import { type OwnedRow } from '@server/common';

import { type AiRole, type ModelGroup, ROLE_GROUP } from './defaults';
import { type RequestGuard } from './hard-line';
import { type ModelRoute, type ProjectConfig } from './model-router.service';

const TASK_PREFIX = 'novel-forge.';

export const SYNAPSE_CHAT_TASK = `${TASK_PREFIX}chat`;

/** Where a record names Synapse rather than a provider: an alias pin or option, whose key is the model, or a call that never answered. */
export const SYNAPSE_PROVIDER = 'synapse';

/** Every project without an owner shares one subject, as they shared one quota window. */
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

export function synapseSelectors({ costTier, contentMode }: Pick<ModelRoute, 'costTier' | 'contentMode'>): Record<string, string> {
  return { tier: costTier, content_mode: contentMode };
}

/** The alias a chat call is sent with: only the author's own pin, already checked against the reply's selectors (`aliasRoutedProject`). */
export function synapseAlias(role: AiRole, project?: ProjectConfig): string | undefined {
  return role === 'chat' && project?.chatPinned ? project.chatAlias : undefined;
}

export function ownerSubject(owner: OwnedRow | undefined): SynapseSubject {
  if (!owner || owner.ownerId === null) return UNOWNED_SUBJECT;
  return { type: 'owner', id: `${owner.ownerKind}:${owner.ownerId}` };
}

export function guardRequestHook(guard: RequestGuard): SynapseRequestHook {
  return request => {
    guard.screen(request.messages);
    return { ...request, messages: [{ role: 'system', content: guard.systemLine }, ...request.messages] } as typeof request;
  };
}
