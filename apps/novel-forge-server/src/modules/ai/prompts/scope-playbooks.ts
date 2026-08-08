import { type Refinement } from '@server/database';

import { ACTION_TYPES, type ActionType, type OpType, renderActionVocabulary, renderOpVocabulary } from '../../refinement/change-set';

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
      "Scope: the entire project — you are the showrunner's right hand with full visibility and full editing power. Judge everything as a serialized web novel AND as a production pipeline: is the canon coherent, is the plan escalating, are drafts moving toward approval, is anything stale or blocked? You may reshape the premise, bible documents, the cast, volumes, arcs, chapter briefs, and draft prose (finalized chapters are locked — never propose edits to them), and you may run the pipeline itself through action operations. When the author's message lays out a volume or arc structure — a list of volumes, phases, or a stated chapters-per-volume figure — MATERIALIZE it as records, not prose: stage one volume.upsert per volume (ordinal, title, objective, conflict, payoff, and targetChapterCount taken from the stated count — for a range like '50–70 chapters' pick a concrete number in range) so the plan appears in the volumes section; a plot document that only narrates the volumes is not a substitute. Prefer the smallest complete change that achieves the author's intent — your change-sets apply to real canon, so propose whole-field values and nothing speculative.",
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
    ],
    allowedActions: ACTION_TYPES,
  },
  novel: {
    guidance:
      'Scope: the whole novel. Judge everything as a serialized web novel: is the hook strong enough to survive chapter one? Are the stakes personal and escalating? Does the progression system give readers a visible ladder to anticipate? Does the premise leave room for hundreds of chapters without going stale? Push the author on reader-promise, update cadence assumptions, and genre conventions. You may reshape the premise, bible documents, the volume plan, and the cast — characters, factions, locations, and the other catalog entities. When the author describes a volume breakdown or a chapters-per-volume figure, stage volume.upsert ops (set targetChapterCount from the stated count) so it becomes the volume plan — do not leave it only as prose in a bible document.',
    allowedOps: ['premise.update', 'bible_document.upsert', 'bible_document.remove', 'volume.upsert', 'volume.remove', 'entity.upsert', 'entity.remove'],
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
      'Scope: one chapter brief. The two things that make or break a serialized chapter: the ending contract (hookType, emotional beat, open question, handoff state — never a hurried, conclusive ending) and the declared context refs (everything the chapter author must see, most important first, chosen from the catalog — never invented). Refine the beats to fill one chapter exactly. Only this brief may change.',
    allowedOps: ['brief.update'],
  },
};

/** Guidance + the exact op shapes — what ChatService feeds the {scopeInstructions} template var. */
export function renderScopeInstructions(scope: Refinement.ChatScope): string {
  const playbook = SCOPE_PLAYBOOKS[scope];
  const sections = [playbook.guidance, renderOpVocabulary(playbook.allowedOps)];
  if (playbook.allowedActions?.length) sections.push(renderActionVocabulary(playbook.allowedActions));
  return sections.join('\n\n');
}

/** The full op allowlist of a scope — content ops plus actions — for change-set validation. */
export function scopeAllowedOps(scope: Refinement.ChatScope): OpType[] {
  const playbook = SCOPE_PLAYBOOKS[scope];
  return [...playbook.allowedOps, ...(playbook.allowedActions ?? [])];
}
