import { type Ideation } from '@server/database';

import { matchPlaybooks } from './constraint-playbooks';
import { hasField, hasRoomConstraint, QUESTION_BANK, type RouterSeedState, type StudioQuestion, type StudioStage } from './question-bank';

export interface RouterResult {
  stage: StudioStage;
  /** At most three questions — a turn that asks more than three gets answers to none of them. */
  questions: StudioQuestion[];
  /** Playbook-forced and follow-up ids still owed, in bank order, whatever stage they belong to. */
  forced: string[];
  /** Ids in `questions` re-offered past `askedQuestions` because a stress-ready field they fill is missing. */
  backfilled: string[];
  /** Per offered id, what is already locked about it — the turn should confirm that rather than re-ask it. */
  hints: Record<string, string>;
  done: boolean;
}

export type ReadinessDimensionName = 'hook' | 'protagonist' | 'engine' | 'ladder' | 'promise' | 'voice' | 'room';

export interface ReadinessDimension {
  dimension: ReadinessDimensionName;
  fields: Ideation.FieldKey[];
  present: Ideation.FieldKey[];
  verdict: Ideation.ReadinessVerdict;
}

interface DimensionSpec {
  dimension: ReadinessDimensionName;
  fields: Ideation.FieldKey[];
  /** A locked constraint the dimension reads as a source of its own, counted alongside the fields. */
  support?: (seed: RouterSeedState) => boolean;
}

const MAX_QUESTIONS_PER_TURN = 3;

const STAGE_ORDER: StudioStage[] = ['spark', 'taste', 'orient', 'diverge', 'deepen', 'stress'];

/** Everything the stress pass needs in front of it before the sheet can be called finished. */
export const STRESS_READY_FIELDS: Ideation.FieldKey[] = ['genre', 'premise', 'hook', 'castShape', 'progressionSystem', 'protagonistDrive', 'stakes', 'voice'];

/**
 * The dimension names follow the concept card's vocabulary: a card's `engine` is what generates
 * pressure and a card's `ladder` is the visible thing that climbs. So `engine` reads `stakes` and
 * `ladder` reads `progressionSystem` — the reverse of the first cut, which named them the other way
 * round and left the two vocabularies contradicting each other.
 */
const READINESS_SPECS: DimensionSpec[] = [
  { dimension: 'hook', fields: ['hook'] },
  { dimension: 'protagonist', fields: ['protagonistDrive', 'castShape'] },
  { dimension: 'engine', fields: ['stakes'] },
  { dimension: 'ladder', fields: ['progressionSystem'] },
  { dimension: 'promise', fields: [], support: seed => seed.constraints.some(constraint => constraint.kind === 'promise') },
  { dimension: 'voice', fields: ['voice'] },
  { dimension: 'room', fields: ['genre'], support: hasRoomConstraint },
];

/** Fills every nullable story_seeds column, so the router never has to defend against a fresh row. */
export function toRouterSeedState(seed: Pick<Ideation.StorySeed, 'fields' | 'constraints' | 'tasteAnchors' | 'concepts' | 'readiness' | 'askedQuestions'>): RouterSeedState {
  return {
    fields: seed.fields ?? {},
    constraints: seed.constraints ?? [],
    tasteAnchors: seed.tasteAnchors ?? { comps: [], preferences: [] },
    concepts: seed.concepts ?? [],
    readiness: seed.readiness ?? [],
    askedQuestions: seed.askedQuestions ?? [],
  };
}

function collectForced(seed: RouterSeedState): Set<string> {
  const { matched } = matchPlaybooks(seed.constraints);
  const ids = new Set<string>();
  for (const { playbook } of matched) for (const id of playbook.forcedQuestions) ids.add(id);
  for (const question of QUESTION_BANK) for (const id of question.followUps?.(seed) ?? []) ids.add(id);

  const asked = new Set(seed.askedQuestions);
  return new Set([...ids].filter(id => !asked.has(id) && QUESTION_BANK.some(question => question.id === id)));
}

/**
 * Retirement, and the reason `fills` being empty is load-bearing. A question that fills sheet fields
 * is spent only once every one of them is present, so an unanswered offer of it comes back. A question
 * that fills nothing retires on its first offer: its answer lands as a locked constraint, none of them
 * fill a stress-ready field, and an enrichment question the author declined is not worth re-asking.
 */
const answered = (seed: RouterSeedState, question: StudioQuestion): boolean =>
  (question.fills.length > 0 && question.fills.every(field => hasField(seed, field))) || question.skipWhen(seed);

/**
 * The fillers of every missing stress-ready field, in bank order, ignoring `askedQuestions` entirely.
 * A suppressed filler (`skipWhen` true — e.g. `diverge.cards` once a premise is locked) is offered only
 * to keep the turn non-empty when no non-suppressed filler covers the gap.
 */
function backfill(seed: RouterSeedState): StudioQuestion[] {
  const missing = STRESS_READY_FIELDS.filter(field => !hasField(seed, field));
  const candidates = QUESTION_BANK.filter(question => question.fills.some(field => missing.includes(field)));
  const active = candidates.filter(question => !question.skipWhen(seed));
  const pool = active.length > 0 ? active : candidates.filter(question => question.skipWhen(seed));
  return pool.slice(0, MAX_QUESTIONS_PER_TURN);
}

const collectHints = (seed: RouterSeedState, questions: StudioQuestion[]): Record<string, string> => {
  const hints: Record<string, string> = {};
  for (const question of questions) {
    const hint = question.hint?.(seed);
    if (hint) hints[question.id] = hint;
  }
  return hints;
};

/**
 * The whole interview, as a pure function of the sheet. Stage by stage it offers the questions not yet
 * asked whose sheet fields are still empty and whose locked constraints have not settled them; a forced
 * question bypasses the second test and is gated only on having been asked before, which is what makes
 * the renewal question fire exactly once — it fills nothing (`fills: []`), so `answered` retires it on
 * its first offer whether or not the author's answer landed in a field. Offered-but-unanswered questions
 * never hold a stage open — a tone question the author skips would otherwise stall the interview on that
 * stage forever.
 *
 * The caller MUST record every id in `questions` — see `recordOffered`. Recording only the ids the
 * author actually answered re-offers a forced question forever, because "already asked" is the only
 * gate a forced question has.
 *
 * The termination invariant is structural rather than statistical. Every field in `STRESS_READY_FIELDS`
 * has at least one filler in the bank (`question-router.spec.ts` pins it), and when the stage walk runs
 * out with the sheet unfinished the router re-offers those fillers regardless of `askedQuestions`. So
 * `questions: [] && done: false` is unreachable, an author who skipped a field is asked again rather
 * than stranded, and a field cleared back to null after the fact is re-offered on the next turn.
 */
export function nextQuestions(seed: RouterSeedState): RouterResult {
  const asked = new Set(seed.askedQuestions);
  const forced = collectForced(seed);
  const forcedList = QUESTION_BANK.filter(question => forced.has(question.id)).map(question => question.id);
  const done = STRESS_READY_FIELDS.every(field => hasField(seed, field));

  for (const stage of STAGE_ORDER) {
    // Diverge exists to invent a premise; a seed that arrived with one skips the concept round — unless a
    // playbook forced a diverge question, which the skip would strand for the rest of the interview.
    if (stage === 'diverge' && hasField(seed, 'premise') && !QUESTION_BANK.some(question => question.stage === 'diverge' && forced.has(question.id))) continue;

    // Stress is the finished-sheet pass; offering it early strands the readiness verdict on an unfinished sheet.
    if (stage === 'stress' && !done) continue;

    const pending = QUESTION_BANK.filter(question => question.stage === stage && !asked.has(question.id) && (forced.has(question.id) || !answered(seed, question)));
    if (pending.length === 0) continue;

    const ordered = [...pending].sort((left, right) => Number(forced.has(right.id)) - Number(forced.has(left.id)));
    const questions = ordered.slice(0, MAX_QUESTIONS_PER_TURN);
    return { stage, questions, forced: forcedList, backfilled: [], hints: collectHints(seed, questions), done };
  }

  const reoffered = done ? [] : backfill(seed);
  return { stage: 'stress', questions: reoffered, forced: forcedList, backfilled: reoffered.map(question => question.id), hints: collectHints(seed, reoffered), done };
}

/**
 * Hard precondition of the router, not a convenience: the turn that offered `result` must persist this
 * array, whether or not the author answered anything. `askedQuestions` records what was *offered* — a
 * turn that records only the answered ids leaves every unanswered forced question eligible again and
 * the interview repeats it on every subsequent turn.
 */
export const recordOffered = (seed: RouterSeedState, result: RouterResult): string[] => {
  const asked = new Set(seed.askedQuestions);
  return [...seed.askedQuestions, ...result.questions.map(question => question.id).filter(id => !asked.has(id))];
};

/**
 * The structural precheck behind the seven readiness dimensions. It reports only what is present and
 * what is missing — whether what is present is any good is the stress prompt's verdict, not this one's.
 */
export function readinessDimensions(seed: RouterSeedState): ReadinessDimension[] {
  return READINESS_SPECS.map(spec => {
    const present = spec.fields.filter(field => hasField(seed, field));
    const supported = spec.support?.(seed) ?? false;
    const sources = spec.fields.length + (spec.support ? 1 : 0);
    const found = present.length + (supported ? 1 : 0);
    const verdict: Ideation.ReadinessVerdict = found === sources ? 'strong' : found > 0 ? 'thin' : 'empty';
    return { dimension: spec.dimension, fields: spec.fields, present, verdict };
  });
}
