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

import { type OpType, validateChangeSet } from '../../refinement/change-set';
import { type ChatRefineOutput, ChatRefineSchema } from '../schemas/chat-refine.schema';
import { AUTHORING_STYLE } from './authoring-preamble';
import { scopeAllowedOps } from './scope-playbooks';
import { type PromptModule } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a senior web novelist collaborating with the author to refine their novel's structure through conversation. Each turn you receive the scoped canon (the artifact under discussion and its surroundings), a scope playbook, the conversation so far, and the author's message. Respond as a rigorous creative partner: challenge weak choices directly, offer concrete alternatives and material, and explain WHY in web-novel terms (hooks, escalation, reader-promise, serialization).\n\nWhen — and only when — the conversation converges on a concrete change, include a changeSet using ONLY the ops the playbook allows for this scope. A changeSet is a staged proposal: nothing is applied until the author accepts it, so propose boldly. Give the complete new value of every field you DO change (a whole field, never a fragment or diff of one), but when you are UPDATING a record that already exists, include ONLY the fields you are changing plus the op's required keys — every field you omit keeps its current stored value, so never re-emit unchanged fields (e.g. to sharpen one arc's hook, changeSet [{"op":"arc.upsert","arcKey":"v1_a1","volumeKey":"v1","hook":"<the new hook>"}] and leave objective, body, cast and the rest out). The one exception is bible_document.upsert — a document is a single whole artifact, so always send its complete frontmatter and body, never a subset. When the turn is exploration or debate, return reply only and no changeSet. Never invent refs, entity keys, or documents not present in the provided context.\n\nIf the playbook lists lookup tools and the provided context is NOT enough to answer or to draft a correct changeSet, request lookups INSTEAD of guessing: return {"reply": <one short sentence saying what you are checking>, "lookups": [{"tool": <listed tool name>, "args": {...}}]} and nothing else — never lookups and a changeSet together. The results come back as the next message; then answer normally. The lookup budget is small, so batch what you need.\n\nRespond with ONLY one valid JSON object of the shape {"reply": string, "changeSet"?: [ops], "lookups"?: [{tool, args}]} — all your prose goes INSIDE the reply string; nothing outside the JSON, no markdown fences.`;

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
  version: '2.1.0',
  kind: 'authoring',
  role: 'chat',
  cacheStrategy: { stableVars: ['scopeInstructions', 'stableContext'] },
  system,
  template: buildTemplate(),
  schema: ChatRefineSchema,
  postValidate: data => validateTurnOutput(data),
};

/** Scope-bound variant: the repair ladder forces the model back inside the scope's op allowlist. */
export function buildChatRefinePrompt(scope: Refinement.ChatScope): PromptModule<ChatRefineOutput> {
  const allowedOps = scopeAllowedOps(scope);
  return {
    ...chatRefinePrompt,
    template: buildTemplate(),
    postValidate: data => validateTurnOutput(data, allowedOps, scope === 'project'),
  };
}

/** Lookups are a hub privilege and always a whole turn by themselves — the repair ladder enforces both. */
function validateTurnOutput(data: ChatRefineOutput, allowedOps?: readonly OpType[], lookupsAllowed = false): string[] {
  const lookups = data.lookups ?? [];
  const hasChangeSet = data.changeSet !== undefined && data.changeSet.length > 0;
  if (lookups.length === 0) return hasChangeSet ? validateChangeSet(data.changeSet, allowedOps) : [];
  if (!lookupsAllowed) return ['lookups are not available for this scope — answer from the provided context'];
  if (hasChangeSet) return ['return either lookups or a changeSet, never both in one turn'];
  return lookups.every(l => typeof l.tool === 'string' && l.tool.length > 0) ? [] : ['every lookup needs a tool name'];
}
