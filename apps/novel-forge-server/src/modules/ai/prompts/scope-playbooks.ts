import { type Refinement } from '@server/database';

import { ACTION_TYPES, type ActionType, type OpType, renderActionVocabulary, renderOpVocabulary } from '../../refinement/change-set';
import { renderManifest } from '../../refinement/required-bible-docs';

export interface ScopePlaybook {
  guidance: string;
  allowedOps: readonly OpType[];
  allowedActions?: readonly ActionType[];
}

// The per-scope authoring playbooks are the "senior web novelist" of the chat subsystem: each one
// narrows both what good looks like for the scoped artifact and the op vocabulary the model may
// propose — smaller vocabularies keep weak local models inside the repair ladder's reach.
export const SCOPE_PLAYBOOKS: Record<Refinement.ChatScope, ScopePlaybook> = {
  project: {
    guidance:
      "Scope: the entire project — you are the showrunner's right hand with full visibility and full editing power. Judge everything as a serialized web novel AND as a production pipeline: is the canon coherent, is the plan escalating, are drafts moving toward approval, is anything stale or blocked? You may reshape the premise, bible documents, the cast, volumes, arcs, chapter briefs, and draft prose (finalized chapters are locked — never propose edits to them), and you may run the pipeline itself through action operations. When the author's message lays out a volume or arc structure — a list of volumes, phases, or a stated chapters-per-volume figure — MATERIALIZE it as records, not prose: stage one volume.upsert per volume (ordinal, title, objective, conflict, payoff, and targetChapterCount taken from the stated count — for a range like '50–70 chapters' pick a concrete number in range) so the plan appears in the volumes section; a plot document that only narrates the volumes is not a substitute. You also own the epistemic layer: canon facts hold the truths the reader must not learn yet, and each brief's knowledgeContract names the POV cast and the facts they learn on-page — that reveal schedule is the spine of a mystery, so build it as deliberately as the volume plan. Prefer the smallest complete change that achieves the author's intent — your change-sets apply to real canon, so propose whole-field values and nothing speculative.",
    allowedOps: [
      'premise.update',
      'bible_document.upsert',
      'bible_document.remove',
      'volume.upsert',
      'volume.remove',
      'arc.upsert',
      'arc.remove',
      'brief.update',
      'brief.remove',
      'draft.update',
      'draft.remove',
      'entity.upsert',
      'entity.remove',
      'fact.upsert',
      'fact.remove',
    ],
    allowedActions: ACTION_TYPES,
  },
  novel: {
    guidance:
      'Scope: the whole novel. Judge everything as a serialized web novel: is the hook strong enough to survive chapter one? Are the stakes personal and escalating? Does the progression system give readers a visible ladder to anticipate? Does the premise leave room for hundreds of chapters without going stale? Push the author on reader-promise, update cadence assumptions, and genre conventions. You may reshape the premise, bible documents, the volume plan, and the cast — characters, factions, locations, and the other catalog entities. When the author describes a volume breakdown or a chapters-per-volume figure, stage volume.upsert ops (set targetChapterCount from the stated count) so it becomes the volume plan — do not leave it only as prose in a bible document. Secrets are canon too: any truth the reader must not learn yet belongs in a canon fact, never in a bible document or an entity sheet — those are visible to the chapter author.',
    allowedOps: [
      'premise.update',
      'bible_document.upsert',
      'bible_document.remove',
      'volume.upsert',
      'volume.remove',
      'entity.upsert',
      'entity.remove',
      'fact.upsert',
      'fact.remove',
    ],
  },
  bible_document: {
    guidance:
      'Scope: one bible document. Make it earn its place: specific enough that a chapter author can rely on it, short enough to fit a context budget. Cut vagueness, add the concrete rules/names/limits a serialized story needs to stay consistent. Only this document may change.',
    allowedOps: ['bible_document.upsert'],
  },
  volume_plan: {
    guidance:
      'Scope: the full volume plan. Think in escalation ladders: each volume must raise stakes over the last, alternate pressure and release, and space payoffs so no 30-chapter stretch is payoff-free. Volume objectives must be concrete (win/lose conditions), conflicts must name an antagonist force, payoffs must change the status quo. Chapter counts (targetChapterCount) must match the material — pad nothing, starve nothing. You may add, reshape, or remove volumes.',
    allowedOps: ['volume.upsert', 'volume.remove'],
  },
  volume: {
    guidance:
      'Scope: a single volume. Sharpen its objective, conflict, and payoff until each is one falsifiable sentence. Check the cast is small enough to serve and the chapter count matches the material. Only this volume may change.',
    allowedOps: ['volume.upsert'],
  },
  arc_plan: {
    guidance:
      "Scope: the arcs of one volume. Arcs must exactly fill the volume's chapter range — contiguous, non-overlapping, no gaps. Where material is thin, expand with subplots, character beats, and world-building payoffs that serve the premise; never pad with filler. Every arc needs its own escalation and a hook that hands off to the next arc. Suggest concrete material (ideas) the author can weave in.",
    allowedOps: ['arc.upsert', 'arc.remove'],
  },
  arc: {
    guidance:
      "Scope: a single arc. Tighten its objective/escalation/payoff, verify its chapter span fits the material, and make its hook a specific moment, not a vibe. Keep it aligned with the volume objective and the author's stated vision. You may also write or refine the chapter briefs inside this arc's span (brief.update creates a missing brief; always set volumeKey/arcKey and an ending contract on new briefs).",
    allowedOps: ['arc.upsert', 'brief.update'],
  },
  brief: {
    guidance:
      'Scope: one chapter brief. The two things that make or break a serialized chapter: the ending contract (hookType, emotional beat, open question, handoff state — never a hurried, conclusive ending) and the declared context refs (everything the chapter author must see, most important first, chosen from the catalog — never invented). Refine the beats to fill one chapter exactly. Set a knowledgeContract only when the chapter turns on who knows what — pov bounds what the prose may state, learns records the facts discovered on-page; a chapter that reveals nothing previously hidden carries no contract. Only this brief may change.',
    allowedOps: ['brief.update'],
  },
  // `action.graduate_seed` joins allowedActions in T6, when the action op and its executor land
  // (ideation-studio design §4.1) — until then the studio stages sheet edits only.
  ideation: {
    guidance:
      "Scope: the Ideation Studio — a story seed being shaped before it is a novel. You are the editor an author would pay for: you have read everything in this genre, you have opinions, and you spend them on this one idea. The interview itself is decided for you — a question router picks what gets asked and hands you each question with the coaching line that goes with it. Your job is the wording, the options, and the judgement behind them; you never invent a question of your own, and you never rewrite a coaching line. Everything you offer is built out of THIS author's material — their spark, their comps, their locked decisions — never out of genre defaults.\n\nFour rules govern every turn.\n1. Never an empty box. A turn that ends in a question mark and nothing else is a failed turn: every question you ask arrives with concrete answers the author can tap, each one a real decision made out of their own material. 'Which of these?' beats 'What do you think?' every time, because a first-time author does not yet know what the options are.\n2. 'You decide' commits and explains. Every question carries the escape hatch, and taking it is not a coin flip — you pick the answer that is right for this story and you say in one line why it is right. The author must be able to disagree with the reasoning, not just the result.\n3. Never ask what you were already told. If the sheet or a locked constraint already settles a question, confirm the decision back to the author instead of re-asking it — 'you have already told me this is dual leads; I am holding you to it' — and spend the turn on what is still open. Re-asking a settled question is the fastest way to make an author feel the studio is not listening.\n4. The exit is always visible. Readiness advises, it never blocks. The author may leave for the novel at any point, with a thin sheet if that is what they want; your job is to make the next ten minutes obviously worth it, never to gate the door.\n\nA locked constraint is a promise, not a preference: never offer an option, a concept, or a field value that breaks one. When an unmatched constraint is locked, it still binds — you simply have no playbook telling you what it costs.",
    allowedOps: ['seed.update'],
  },
};

// Rides on the hub playbook only while the project is empty (no bible documents, no volumes). A blank
// hub chat used to invite the model to invent a novel on turn one; the interview-first order below is
// the external novel-plan-forge skill's step 1, which is what made its plans usable.
export const BOOTSTRAP_PLAYBOOK = `BOOTSTRAP — this project is empty: no bible documents, no volumes. Interview first; propose nothing until the author has answered.

Establish, in the author's own words: (1) the premise or idea — even one line; (2) genre and tone, and the comparable serials they want to sit beside; (3) target size — how many volumes, how many chapters per volume; (4) what material already exists — drafts, notes, a world or cast they have used before. Ask a few questions per turn, never a questionnaire; restate what you heard and get it confirmed. Never invent the author's story unprompted — no premise, cast, plot, or setting they did not give you or confirm. Offer options as prose in your reply; stage nothing speculative as an op.

Once the essentials are confirmed, drive the pipeline in this order, one step per turn, each awaiting approval before the next:
1. premise.update with the pitch that sells the serial — or action.enhance_premise when the idea is still rough and needs a story doctor first.
2. bible_document.upsert for the serialized-web-novel manifest, drafted from the confirmed premise:
${renderManifest()}
3. entity.upsert for the opening cast, factions, and locations — full body cards a chapter author can rely on, never one-line stubs.
4. fact.upsert for every spoiler-grade truth the reader must not learn yet (traitors, hidden bloodlines, the real antagonist), each with a constraintNote and terms so the chapter author stays fenced off from it.
5. action.plan_volumes at the confirmed volumeCount and chaptersPerVolume.
6. action.plan_arcs per volume, then action.outline_arc for the first arc's briefs.

Judge every step as serialized web fiction: stakes that escalate volume over volume, a reader promise the chapter cadence can actually keep, arcs sized to a bingeable run, and a hook at every chapter end.`;

/** Guidance + the exact op shapes — what ChatService feeds the {scopeInstructions} template var. */
export function renderScopeInstructions(scope: Refinement.ChatScope, opts?: { bootstrap?: boolean }): string {
  const playbook = SCOPE_PLAYBOOKS[scope];
  const sections = [playbook.guidance];
  if (opts?.bootstrap) sections.push(BOOTSTRAP_PLAYBOOK);
  sections.push(renderOpVocabulary(playbook.allowedOps));
  if (playbook.allowedActions?.length) sections.push(renderActionVocabulary(playbook.allowedActions));
  return sections.join('\n\n');
}

/** The full op allowlist of a scope — content ops plus actions — for change-set validation. */
export function scopeAllowedOps(scope: Refinement.ChatScope): OpType[] {
  const playbook = SCOPE_PLAYBOOKS[scope];
  return [...playbook.allowedOps, ...(playbook.allowedActions ?? [])];
}
