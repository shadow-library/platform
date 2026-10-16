import { LEGACY_SLUG_ALIAS, type SynapseSubject } from '@shadow-library/synapse';
import { type SynapseRequestHook } from '@shadow-library/synapse/langchain';

import { AppErrorCode } from '@server/classes';
import { type OwnedRow } from '@server/common';

import { type AiRole, type ResolvedModel, ROLE_GROUP } from './defaults';
import { type RequestGuard } from './hard-line';
import { type ModelRoute, type ProjectConfig } from './model-router.service';

const TASK_PREFIX = 'novel-forge.';

export const SYNAPSE_CHAT_TASK = `${TASK_PREFIX}chat`;

/** Every project without an owner shares one subject, as they shared one quota window. */
export const UNOWNED_SUBJECT: SynapseSubject = { type: 'owner', id: 'unowned' };

/** Image and embedding calls never reach a chat model, so their groups have no chat task. */
export function synapseChatTask(role: AiRole): string {
  const group = ROLE_GROUP[role];
  if (!group || group === 'image' || group === 'embedding') throw AppErrorCode.AI_002.create();
  return `${TASK_PREFIX}${group}`;
}

export function synapseSelectors({ costTier, contentMode }: Pick<ModelRoute, 'costTier' | 'contentMode'>): Record<string, string> {
  return { tier: costTier, content_mode: contentMode };
}

/** The author's own pin on the chat; a turn also holds an unpinned chat's tier default as its chat model, which must stay Synapse's to route. */
export function chatPinOf(project: ProjectConfig | undefined): ResolvedModel | undefined {
  return project?.chatPinned ? project.chatModel : undefined;
}

/** Only a pin the router honoured is sent: an unrestricted call keeps routing a pin off the allowlist to the tier default, as it always has. */
export function synapseAlias(role: AiRole, route: ModelRoute, chatPin?: ResolvedModel): string | undefined {
  if (role !== 'chat' || !chatPin || route.resolved.model !== chatPin.model) return undefined;
  return LEGACY_SLUG_ALIAS[chatPin.model];
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
