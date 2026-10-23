import { HOOK_TYPES } from '../../ai/schemas/enums';
import { type ActionType, type OpType } from './change-set.types';
import { modelHiddenFields, OP_SPECS, type OpVocabularyOptions } from './op-specs';

// What each action does, rendered into the hub playbook so the model picks actions by meaning, not by
// guessing from the name.
const ACTION_PURPOSES: Record<ActionType, string> = {
  'action.generate_chapter':
    'draft one planned chapter from its plan (drafted, judged, and queued for review) — chapters are written in order, so it must be the next one without a draft; never auto-applied',
  'action.audit_bible':
    'queue a Story Bible audit: missing, thin or pointless pages and records, and contradictions between pages, records, facts and finalized chapters — its report holds the findings and one card of proposed changes',
  'action.enhance_premise': 'evaluate and strengthen the premise as a web novel — stages a premise proposal',
  'action.judge_draft': 'run the continuity judge on one chapter draft',
  'action.revise_draft': 'revise one chapter draft using `note` as the revision feedback',
  'action.approve_draft': 'approve one reviewed chapter draft',
  'action.apply_continuity':
    "add one chapter's pending Story Bible additions (the continuity proposal waiting on the author) to the Story Bible — writes canon, never auto-applied",
  'action.validate': 'run continuity validation over the novel or one chapter',
  'action.finalize':
    "finalize an approved chapter (`upTo`) into locked canon, writing the Story Bible updates its review kept — refused while any of them still waits on the author's call, which they make on the chapter's Story Bible card; approval already finalizes a chapter that left nothing to ask — irreversible, never auto-applied",
  'action.organise_notes': "organise the author's stored notes into Story Bible pages, records, a timeline and open questions — runs as a job and stages the result as a card",
  'action.plan_chapter':
    "plan the next chapter — the lowest-numbered one without a draft; `chapter` must be that chapter when given. Before planning, recap in your reply the two or three obligations that matter now (the previous chapter's hook, the longest-quiet promise, what the volume goal needs); when the author has not said what happens, offer two or three directions, each saying which obligation it moves and what it costs, and let the author choose. Then plan from `direction` (the one the author chose, as offered), `intent` (what the author says happens, in their words), or `empty: true` (an empty plan the author fills in). Runs as a job and stages the plan as a card; the plan never sets the chapter's content mode",
  'action.advance_volume':
    'the author\'s "goal met — start next": `volumeKey` must name the currently active volume, which becomes goal met; the next not-started volume in order becomes active, or none does if there isn\'t one yet — never auto-applied',
};

const RATIONALE_NOTE =
  'rationale, on any op, is one short sentence saying why that change is being made. It is shown to the author beside the op when they review the proposal and is never written into the story itself.';

const QUOTE_NOTE =
  "quote, on any op, is the exact words from the author's message in this turn that the op records — copied character for character, never paraphrased, shortened with an ellipsis, or taken from an earlier message or your own reply. The server decides whether an op with a quote the author really wrote applies: it must only record what they said, stated rather than asked or hedged. Every other op becomes a suggestion card the author accepts or declines. Give a quote only when the op states what the author said, and leave it out of your own ideas.";

/**
 * Renders the exact JSON shape of each allowed op for prompt use — weak local models return
 * malformed change-sets when the vocabulary is named but never shown.
 */
export function renderOpVocabulary(ops: readonly OpType[], options: OpVocabularyOptions = {}): string {
  const lines = ops.map(op => {
    const spec = OP_SPECS[op];
    const required = Object.entries(spec.required).map(([key, kind]) => `"${key}": <${kind}, required>`);
    const hidden = modelHiddenFields(op, options);
    const optional = Object.entries(spec.optional)
      .filter(([key]) => !hidden.includes(key))
      .map(([key, kind]) => `"${key}": <${kind}, optional>`);
    return `- {"op": "${op}"${[...required, ...optional].map(f => `, ${f}`).join('')}}${spec.description ? ` — ${spec.description}` : ''}`;
  });
  const contractShape = ops.includes('brief.update')
    ? `\nendingContract, when present, must be exactly: {"hookType": <one of: ${HOOK_TYPES.join(' | ')}>, "emotionalBeat": <non-empty string>, "openQuestion": <non-empty string>, "handoffState": <non-empty string>, "mustNotResolve": <string[], optional>} — hookType is an enum, never free text.`
    : '';
  const knowledgeShape = ops.includes('brief.update')
    ? `\nknowledgeContract, when present, must be exactly: {"pov": <non-empty array of entity keys>, "learns": <optional array of {"entityKey": <string>, "factKey": <string>}>} — pov bounds what the chapter may state; learns names the facts discovered on-page. A chapter that reveals nothing previously hidden omits the contract entirely; pass null to drop one the brief already carries.`
    : '';
  const factRules = ops.includes('fact.upsert')
    ? '\nCanon facts are the spoiler ledger: a truth the reader must not learn yet goes in fact.upsert body and NEVER in bible prose, an entity sheet, or a brief — those are visible to the drafter. constraintNote is an author-only note the drafter never sees; writerNote is the writer-safe instruction the drafter gets while the fact is hidden — it must never state or hint at the truth, and without one the fact is withheld from the drafter entirely; terms are the give-away names and phrases the leak scan blocks. In a mystery the reveal schedule IS the plot, so place each reveal deliberately: set revealChapter as the intended beat and stage the matching brief.update knowledgeContract.learns that pays it off. Omit revealChapter to leave the schedule alone; pass null to undate the fact — an undated fact without an unlock stays hidden and no plan may reveal it. unlock, when present, is {"all": [<one of {"milestone": <key>} | {"volume": <key>} | {"chapter": <number>} | {"ending": true}>, ...]} — the fact may be revealed only once every term holds; allowedClues are observable effects the writer may show while the explanation stays hidden. Omit either to keep it; pass null to clear it.'
    : '';
  const quoteNote = options.quotes ? `\n${QUOTE_NOTE}` : '';
  return `changeSet, when present, must be an ARRAY of operation objects. Allowed operations and their fields:\n${lines.join('\n')}\n${RATIONALE_NOTE}${quoteNote}${contractShape}${knowledgeShape}${factRules}`;
}

/** Action shapes + what each one does — the pipeline half of the hub playbook. */
export function renderActionVocabulary(actions: readonly ActionType[]): string {
  const lines = actions.map(action => {
    const spec = OP_SPECS[action];
    const hidden = modelHiddenFields(action, {});
    const required = Object.entries(spec.required).map(([key, kind]) => `"${key}": <${kind}, required>`);
    const optional = Object.entries(spec.optional)
      .filter(([key]) => !hidden.includes(key))
      .map(([key, kind]) => `"${key}": <${kind}, optional>`);
    return `- {"op": "${action}"${[...required, ...optional].map(f => `, ${f}`).join('')}} — ${ACTION_PURPOSES[action]}`;
  });
  return `Action operations may appear in the same changeSet array; they run the pipeline instead of editing content. Use one only when the author asks for that work to happen:\n${lines.join('\n')}`;
}
