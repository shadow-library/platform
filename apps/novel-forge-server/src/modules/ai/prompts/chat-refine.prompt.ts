/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { type Refinement } from '@server/database';

import { AUTHORING_STYLE } from './authoring-preamble';
import { scopeAllowedOps } from './scope-playbooks';
import { type PromptModule } from './types';
import { validateChangeSet } from '../../refinement/change-set';
import { type ChatRefineOutput, ChatRefineSchema } from '../schemas/chat-refine.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a senior web novelist collaborating with the author to refine their novel's structure through conversation. Each turn you receive the scoped canon (the artifact under discussion and its surroundings), a scope playbook, the conversation so far, and the author's message. Respond as a rigorous creative partner: challenge weak choices directly, offer concrete alternatives and material, and explain WHY in web-novel terms (hooks, escalation, reader-promise, serialization).\n\nWhen — and only when — the conversation converges on a concrete change, include a changeSet using ONLY the ops the playbook allows for this scope. A changeSet is a staged proposal: nothing is applied until the author accepts it, so propose boldly but completely (whole-field values, not fragments). When the turn is exploration or debate, return reply only and no changeSet. Never invent refs, entity keys, or documents not present in the provided context.\n\nRespond with ONLY one valid JSON object of the shape {"reply": string, "changeSet"?: [ops]} — all your prose goes INSIDE the reply string; nothing outside the JSON, no markdown fences.`;

// The message layout is the caching contract (design §10.2): static system, then the stable scope
// context, then history, with the volatile tail last — keep this ordering when editing.
function buildTemplate(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Scope playbook:\n{scopeInstructions}\n\n{stableContext}'],
    new MessagesPlaceholder({ variableName: 'history', optional: true }),
    ['human', 'Changed since this conversation started:\n{volatileContext}\n\n{userMessage}'],
  ]);
}

export const chatRefinePrompt: PromptModule<ChatRefineOutput> = {
  key: 'chat-refine',
  version: '1.0.0',
  kind: 'authoring',
  role: 'chat',
  cacheStrategy: { stableVars: ['scopeInstructions', 'stableContext'] },
  system,
  template: buildTemplate(),
  schema: ChatRefineSchema,
  postValidate: data => (data.changeSet === undefined || data.changeSet.length === 0 ? [] : validateChangeSet(data.changeSet)),
};

/** Scope-bound variant: the repair ladder forces the model back inside the scope's op allowlist. */
export function buildChatRefinePrompt(scope: Refinement.ChatScope): PromptModule<ChatRefineOutput> {
  const allowedOps = scopeAllowedOps(scope);
  return {
    ...chatRefinePrompt,
    template: buildTemplate(),
    postValidate: data => (data.changeSet === undefined || data.changeSet.length === 0 ? [] : validateChangeSet(data.changeSet, allowedOps)),
  };
}
