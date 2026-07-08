/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type Refinement } from '@server/database';

import { type OpType, renderOpVocabulary } from '../../refinement/change-set';

/**
 * Defining types
 */

export interface ScopePlaybook {
  guidance: string;
  allowedOps: readonly OpType[];
}

/**
 * Declaring the constants
 */

// The per-scope authoring playbooks are the "senior web novelist" of the chat subsystem: each one
// narrows both what good looks like for the scoped artifact and the op vocabulary the model may
// propose — smaller vocabularies keep weak local models inside the repair ladder's reach.
export const SCOPE_PLAYBOOKS: Record<Refinement.ChatScope, ScopePlaybook> = {
  novel: {
    guidance:
      'Scope: the whole novel. Judge everything as a serialized web novel: is the hook strong enough to survive chapter one? Are the stakes personal and escalating? Does the progression system give readers a visible ladder to anticipate? Does the premise leave room for hundreds of chapters without going stale? Push the author on reader-promise, update cadence assumptions, and genre conventions. You may reshape the premise, bible documents, and the volume plan.',
    allowedOps: ['premise.update', 'bible_document.upsert', 'bible_document.remove', 'volume.upsert', 'volume.remove'],
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
      "Scope: a single arc. Tighten its objective/escalation/payoff, verify its chapter span fits the material, and make its hook a specific moment, not a vibe. Keep it aligned with the volume objective and the author's stated vision. Only this arc may change.",
    allowedOps: ['arc.upsert'],
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
  return `${playbook.guidance}\n\n${renderOpVocabulary(playbook.allowedOps)}`;
}
