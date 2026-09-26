import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { z } from 'zod';

import { type Refinement } from '@server/database';

import { type OpType, validateChangeSet } from '../../refinement/change-set';
import { countTokens } from '../context/token-budget';
import { type RegisteredTool } from '../tools/types';
import { type ChatRefineOutput, ChatRefineSchema } from '../schemas/chat-refine.schema';
import { proseEditIssues } from '../../refinement/prose-intent';
import { AUTHORING_STYLE_PLANNING, EDIT_BY_DELETION } from './authoring-preamble';
import { HUB_ALLOWED_OPS, HUB_INSTRUCTIONS } from './scope-playbooks';
import { type PromptModule } from './types';

const system = `${AUTHORING_STYLE_PLANNING}\n\n${EDIT_BY_DELETION}\n\nYou are a senior web novelist collaborating with the author to refine their novel's structure through conversation. Each turn you receive the scoped canon (the artifact under discussion and its surroundings), a scope playbook, the conversation so far, and the author's message. Respond as a rigorous creative partner: challenge weak choices directly, offer concrete alternatives and material, and explain WHY in web-novel terms (hooks, escalation, reader-promise, serialization).\n\nWhen — and only when — the conversation converges on a concrete change, include a changeSet using ONLY the ops the playbook allows for this scope. An op that records what the author said in this message carries their exact words as its quote, and the server decides whether it applies; every other op is a suggestion card that nothing applies until the author accepts it, so propose your own ideas boldly — as ideas, without a quote. A what-if worth keeping is a suggestion card too. Give the complete new value of every field you DO change (a whole field, never a fragment or diff of one), but when you are UPDATING a record that already exists, include ONLY the fields you are changing plus the op's required keys — every field you omit keeps its current stored value, so never re-emit unchanged fields (e.g. to change one character's motivation, changeSet [{"op":"entity.upsert","entityKey":"mira","type":"character","motivation":"<the new motivation>"}] and leave name, notes, body and the rest out). The one exception is bible_document.upsert — a document is a single whole artifact, so always send its complete frontmatter and body, never a subset. Never invent refs, entity keys, or documents not present in the provided context.\n\nIf the playbook lists lookup tools and the provided context is NOT enough to answer or to draft a correct changeSet, request lookups INSTEAD of guessing: return {"reply": <one short sentence saying what you are checking>, "lookups": [{"tool": <listed tool name>, "args": {...}}]} and nothing else — never lookups and a changeSet together. The results come back as the next message; then answer normally. The lookup budget is small, so batch what you need.\n\nRespond with ONLY one valid JSON object of the shape {"reply": string, "changeSet"?: [ops], "lookups"?: [{tool, args}]} — all your prose goes INSIDE the reply string; nothing outside the JSON, no markdown fences.`;

// The message layout is the caching contract: static system, then the stable scope
// context, then history, with the volatile tail last — keep this ordering when editing.
function buildTemplate(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Scope playbook:\n{scopeInstructions}\n\n{stableContext}'],
    new MessagesPlaceholder({ variableName: 'history', optional: true }),
    ['human', 'Where the story stands now:\n{volatileContext}\n\n{turnRules}\n\n{userMessage}'],
  ]);
}

// The template's own headings, separators and message framing around the parts it is given.
const CHAT_TEMPLATE_OVERHEAD = 64;

/** The playbook with the lookup half: names, argument shapes and purposes of the read-only tools. */
export function chatScopeInstructions(tools: readonly RegisteredTool[]): string {
  const lines = tools.map(tool => {
    const shape = tool.inputSchema instanceof z.ZodObject ? Object.keys(tool.inputSchema.shape).join(', ') : 'see description';
    return `- ${tool.name} (args: ${shape}) — ${tool.description}`;
  });
  return `${HUB_INSTRUCTIONS}\n\nLookup tools available this scope (read-only):\n${lines.join('\n')}`;
}

/** What a turn's prompt costs before any context, history or message: the system prompt and the playbook. */
export function chatPromptTokens(scopeInstructions: string): number {
  return countTokens(system) + countTokens(scopeInstructions) + CHAT_TEMPLATE_OVERHEAD;
}

export const chatRefinePrompt: PromptModule<ChatRefineOutput> = {
  key: 'chat-refine',
  version: '2.9.0',
  kind: 'authoring',
  role: 'chat',
  cacheStrategy: { stableVars: ['scopeInstructions', 'stableContext'] },
  system,
  template: buildTemplate(),
  schema: ChatRefineSchema,
  postValidate: data => validateTurnOutput(data),
};

export interface ChatTurnPermissions {
  /** Whether the author turned on Edit prose for this turn. */
  proseEdits: boolean;
  /** Whether the author marked the turn as just discussing. */
  justDiscussing?: boolean;
}

const JUST_DISCUSSING_RULE =
  'Just discussing: ON — the author is thinking aloud, so nothing this turn applies. Any change you propose becomes a suggestion card for the author to accept or decline; leave quotes out.';

export function renderTurnRules(permissions: ChatTurnPermissions): string {
  const prose = permissions.proseEdits
    ? 'Prose edits: ON — the author turned on Edit prose, so draft.update, draft.remove and action.revise_draft are available this turn.'
    : 'Prose edits: OFF — the author did not turn on Edit prose. draft.update, draft.remove and action.revise_draft will be rejected, along with approving, judging or finalizing that prose; keep a plan edit in the plan.';
  return permissions.justDiscussing ? `${prose}\n${JUST_DISCUSSING_RULE}` : prose;
}

/**
 * Per-turn variant: the repair ladder forces the model back inside the playbook's op allowlist, and `scope` decides only
 * whether lookups are on. A prose op the author did not ask for is advisory rather than blocking, so a model that insists
 * costs one repair and then loses the op, never the turn.
 */
export function buildChatRefinePrompt(scope: Refinement.ChatScope, permissions: ChatTurnPermissions = { proseEdits: false }): PromptModule<ChatRefineOutput> {
  return {
    ...chatRefinePrompt,
    template: buildTemplate(),
    postValidate: data => validateTurnOutput(data, HUB_ALLOWED_OPS, scope === 'project'),
    advise: data => (permissions.proseEdits || (data.lookups?.length ?? 0) > 0 ? [] : proseEditIssues(data.changeSet)),
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
