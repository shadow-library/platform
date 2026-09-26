import { type RevealFact, revealRequirements, type UnlockContext } from '@server/common';
import { type FinalizeReview, type Knowledge } from '@server/database';

import { WALLED_OFF_EXCERPT } from '../ai/isolation-read-policy';
import {
  type ContinuityCharacterState,
  type ContinuityMystery,
  type ContinuityNewEntity,
  type ContinuityOutput,
  type ContinuityRelationship,
  type ContinuityThread,
} from '../ai/schemas/continuity.schema';

export type ProposedChange =
  | { category: 'entity'; entity: ContinuityNewEntity }
  | { category: 'appearance'; entityKey: string }
  | { category: 'character_state'; state: Omit<ContinuityCharacterState, 'confidence'> }
  | { category: 'relationship'; relationship: Omit<ContinuityRelationship, 'confidence'> }
  | { category: 'promise'; thread: Omit<ContinuityThread, 'confidence'> }
  | { category: 'promise'; mystery: Omit<ContinuityMystery, 'confidence'> }
  | { category: 'knowledge'; entityKey: string; factKey: string; how: string }
  | { category: 'milestone'; milestoneKey: string; reached: boolean };

export interface ProposedItem {
  itemKey: string;
  category: FinalizeReview.Category;
  triage: FinalizeReview.Triage;
  basis: FinalizeReview.Basis;
  subjectKey: string;
  claim: string;
  evidence: string | null;
  proposed: ProposedChange;
  flag: FinalizeReview.Flag | null;
  dependents: string[] | null;
  decision: FinalizeReview.Decision | null;
  autoKept: boolean;
}

export interface ReviewMaterial {
  extraction: ContinuityOutput;
  isolated: boolean;
  /** Milestones the approved plan claims for this chapter. */
  claimedMilestones: readonly string[];
  milestones: readonly Pick<Knowledge.Milestone, 'milestoneKey' | 'label' | 'state'>[];
  entityKeys: ReadonlySet<string>;
  /** Pairs the approved plan's `learns` already ledgered, as `entityKey:factKey`. */
  plannedLearns: ReadonlySet<string>;
  /** Facts this chapter's plan reveals, for the reveals a missed milestone would leave without their condition. */
  plannedFactKeys: readonly string[];
  facts: readonly RevealFact[];
  /** The approved plan's unlock context: what counts as reached at this chapter. */
  unlock: UnlockContext;
  autoKeep: ReadonlySet<FinalizeReview.Category>;
}

type Draft = Omit<ProposedItem, 'itemKey' | 'decision' | 'autoKept' | 'triage' | 'flag' | 'dependents'> &
  Partial<Pick<ProposedItem, 'flag' | 'dependents'>> & { consequential: boolean };

const RULE_ENTITY_TYPES: ReadonlySet<Knowledge.EntityType> = new Set(['power_rule', 'concept']);

function basisOf(entry: { confidence?: 'high' | 'low' }): FinalizeReview.Basis {
  return entry.confidence === 'low' ? 'inferred' : 'observed';
}

function withoutConfidence<T extends { confidence?: 'high' | 'low' }>(entry: T): Omit<T, 'confidence'> {
  const { confidence: _confidence, ...rest } = entry;
  return rest;
}

/** Keyed by the record the update is about, never by its wording, so a re-read that phrases the same update differently keeps its answer. */
export function itemKeyOf(proposed: ProposedChange): string {
  switch (proposed.category) {
    case 'entity':
      return `entity:${proposed.entity.entityKey}`;
    case 'appearance':
      return `appearance:${proposed.entityKey}`;
    case 'character_state':
      return `character_state:${proposed.state.entityKey}`;
    case 'relationship':
      return `relationship:${proposed.relationship.entityKey}:${proposed.relationship.targetKey}:${proposed.relationship.kind}`;
    case 'promise':
      return 'thread' in proposed ? `promise:thread:${proposed.thread.threadKey}` : `promise:mystery:${proposed.mystery.mysteryKey}`;
    case 'knowledge':
      return `knowledge:${proposed.entityKey}:${proposed.factKey}`;
    case 'milestone':
      return `milestone:${proposed.milestoneKey}`;
  }
}

// Postgres jsonb reorders object keys, so anything read back from a jsonb column compares by content, not by key order.
export function canonicalJson(value: unknown): string {
  const canonical = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(canonical);
    if (entry === null || typeof entry !== 'object') return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .filter(([, field]) => field !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, field]) => [key, canonical(field)]),
    );
  };
  return JSON.stringify(canonical(value));
}

/** Whether two proposals would write the same thing: a kept answer carries over only onto the change the author actually saw. */
export function sameProposal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function entityItems(extraction: ContinuityOutput): Draft[] {
  const created = (extraction.newEntities ?? []).map(entity => ({
    category: 'entity' as const,
    basis: 'observed' as const,
    subjectKey: entity.entityKey,
    claim: `New ${entity.type.replace('_', ' ')}: ${entity.name}${entity.notes ? ` — ${entity.notes}` : ''}`,
    evidence: null,
    proposed: { category: 'entity' as const, entity },
    consequential: RULE_ENTITY_TYPES.has(entity.type),
  }));
  const createdKeys = new Set(created.map(item => item.subjectKey));
  const appeared = [...new Set(extraction.appeared ?? [])]
    .filter(entityKey => !createdKeys.has(entityKey))
    .map(entityKey => ({
      category: 'appearance' as const,
      basis: 'observed' as const,
      subjectKey: entityKey,
      claim: `${entityKey} appears in this chapter`,
      evidence: null,
      proposed: { category: 'appearance' as const, entityKey },
      consequential: false,
    }));
  return [...created, ...appeared];
}

function characterItems(extraction: ContinuityOutput): Draft[] {
  const states = (extraction.characterStates ?? []).map(state => {
    const change = [
      state.location && `at ${state.location}`,
      state.conditions?.length && state.conditions.join(', '),
      state.immediateGoal && `wants to ${state.immediateGoal}`,
      state.statusNote,
    ]
      .filter(Boolean)
      .join('; ');
    return {
      category: 'character_state' as const,
      basis: basisOf(state),
      subjectKey: state.entityKey,
      claim: `${state.entityKey} is now ${change || 'unchanged'}`,
      evidence: state.evidence,
      proposed: { category: 'character_state' as const, state: withoutConfidence(state) },
      consequential: state.confidence === 'low',
    };
  });
  const relationships = (extraction.relationships ?? []).map(relationship => ({
    category: 'relationship' as const,
    basis: basisOf(relationship),
    subjectKey: relationship.entityKey,
    claim: `${relationship.entityKey} → ${relationship.targetKey}: ${relationship.kind}${relationship.note ? ` (${relationship.note})` : ''}`,
    evidence: relationship.evidence,
    proposed: { category: 'relationship' as const, relationship: withoutConfidence(relationship) },
    consequential: relationship.confidence === 'low',
  }));
  return [...states, ...relationships];
}

function promiseItems(extraction: ContinuityOutput): Draft[] {
  const threads = (extraction.threads ?? []).map(thread => ({
    category: 'promise' as const,
    basis: basisOf(thread),
    subjectKey: thread.threadKey,
    claim: thread.status === 'closed' ? `Paid off: ${thread.summary ?? thread.threadKey}` : `Open: ${thread.summary ?? thread.threadKey}`,
    evidence: null,
    proposed: { category: 'promise' as const, thread: withoutConfidence(thread) },
    consequential: thread.status !== 'open' || thread.confidence === 'low',
  }));
  const mysteries = (extraction.mysteries ?? []).map(mystery => ({
    category: 'promise' as const,
    basis: basisOf(mystery),
    subjectKey: mystery.mysteryKey,
    claim: mystery.status === 'resolved' ? `Answered: ${mystery.question ?? mystery.mysteryKey}` : `Open question: ${mystery.question ?? mystery.mysteryKey}`,
    evidence: null,
    proposed: { category: 'promise' as const, mystery: withoutConfidence(mystery) },
    consequential: mystery.status !== 'open' || Boolean(mystery.truthFactKey) || mystery.confidence === 'low',
  }));
  return [...threads, ...mysteries];
}

function knowledgeItems(material: ReviewMaterial): Draft[] {
  const facts = new Map(material.facts.map(fact => [fact.factKey, fact]));
  return (material.extraction.knowledgeChanges ?? [])
    .filter(change => !material.plannedLearns.has(`${change.entityKey}:${change.factKey}`))
    .map(change => {
      const fact = facts.get(change.factKey);
      const locked = fact ? revealRequirements(fact, material.unlock) : [];
      return {
        category: 'knowledge' as const,
        basis: 'inferred' as const,
        subjectKey: change.entityKey,
        claim: `${change.entityKey} learns ${change.factKey} — ${change.how}`,
        evidence: null,
        proposed: { category: 'knowledge' as const, entityKey: change.entityKey, factKey: change.factKey, how: change.how },
        consequential: true,
        ...(locked.length > 0 ? { flag: 'unplanned_disclosure' as const, dependents: locked } : {}),
      };
    });
}

/** The reveals this chapter's plan makes that hold only while the milestone counts as reached. */
function revealsDependingOn(material: ReviewMaterial, milestoneKey: string): string[] {
  const reached = new Set(material.unlock.reachedMilestones);
  reached.delete(milestoneKey);
  const without: UnlockContext = { ...material.unlock, reachedMilestones: reached };
  const planned = new Set(material.plannedFactKeys);
  return material.facts
    .filter(fact => planned.has(fact.factKey) && revealRequirements(fact, material.unlock).length === 0 && revealRequirements(fact, without).length > 0)
    .map(fact => fact.factKey);
}

function milestoneItems(material: ReviewMaterial): Draft[] {
  const reported = new Map((material.extraction.milestones ?? []).map(entry => [entry.milestoneKey, entry]));
  const known = new Map(material.milestones.map(milestone => [milestone.milestoneKey, milestone]));
  const claimed = new Set(material.claimedMilestones);
  const drafts: Draft[] = [];
  for (const milestoneKey of claimed) {
    const entry = reported.get(milestoneKey);
    const label = known.get(milestoneKey)?.label ?? milestoneKey;
    const dependents = revealsDependingOn(material, milestoneKey);
    if (entry?.reached) {
      drafts.push({
        category: 'milestone',
        basis: 'observed',
        subjectKey: milestoneKey,
        claim: `Reached: ${label}`,
        evidence: entry.evidence ?? null,
        proposed: { category: 'milestone', milestoneKey, reached: true },
        consequential: false,
        dependents: dependents.length > 0 ? dependents : null,
      });
      continue;
    }
    drafts.push({
      category: 'milestone',
      basis: 'inferred',
      subjectKey: milestoneKey,
      claim: `The plan claims "${label}", but the prose does not seem to reach it — it stays locked`,
      evidence: null,
      proposed: { category: 'milestone', milestoneKey, reached: false },
      consequential: true,
      flag: 'missed_milestone',
      dependents: dependents.length > 0 ? dependents : null,
    });
  }
  for (const entry of reported.values()) {
    const milestone = known.get(entry.milestoneKey);
    if (!entry.reached || claimed.has(entry.milestoneKey) || !milestone || milestone.state === 'reached') continue;
    drafts.push({
      category: 'milestone',
      basis: 'inferred',
      subjectKey: entry.milestoneKey,
      claim: `The prose seems to reach "${milestone.label}", which the plan does not claim`,
      evidence: entry.evidence ?? null,
      proposed: { category: 'milestone', milestoneKey: entry.milestoneKey, reached: true },
      consequential: true,
      flag: 'unclaimed_milestone',
    });
  }
  return drafts;
}

/**
 * Turns what the continuity extractor read from the approved revision into review items. Consequential items (rules, payoffs, knowledge,
 * milestones in doubt, anything inferred) wait for the author one by one; routine ones are batched, and kept at once in an auto-keep category.
 * Unknown entities are dropped here rather than failing at apply. An isolated chapter's evidence is withheld before it is ever stored.
 */
export function buildReviewItems(material: ReviewMaterial): ProposedItem[] {
  const known = new Set([...material.entityKeys, ...(material.extraction.newEntities ?? []).map(entity => entity.entityKey)]);
  const drafts = [
    ...entityItems(material.extraction),
    ...characterItems(material.extraction),
    ...promiseItems(material.extraction),
    ...knowledgeItems(material),
    ...milestoneItems(material),
  ];
  // A record reported twice keeps its last report, as the direct continuity path's upserts do.
  const byKey = new Map<string, Draft>();
  for (const draft of drafts) {
    if (['appearance', 'character_state', 'relationship', 'knowledge'].includes(draft.category) && !known.has(draft.subjectKey)) continue;
    if (draft.proposed.category === 'relationship' && !known.has(draft.proposed.relationship.targetKey)) continue;
    byKey.set(itemKeyOf(draft.proposed), draft);
  }
  const items: ProposedItem[] = [];
  for (const [itemKey, { consequential, ...draft }] of byKey) {
    const triage: FinalizeReview.Triage = consequential ? 'consequential' : 'routine';
    const autoKept = !material.isolated && triage === 'routine' && material.autoKeep.has(draft.category);
    items.push({
      ...draft,
      itemKey,
      triage,
      flag: draft.flag ?? null,
      dependents: draft.dependents ?? null,
      evidence: material.isolated && draft.evidence !== null ? WALLED_OFF_EXCERPT : draft.evidence,
      decision: autoKept ? 'kept' : null,
      autoKept,
    });
  }
  return items;
}

type Check = (value: unknown) => boolean;

const text: Check = value => typeof value === 'string' || value === null;
const flag: Check = value => typeof value === 'boolean';
const list: Check = value => value === null || (Array.isArray(value) && value.every(entry => typeof entry === 'string'));
const oneOf =
  (...allowed: string[]): Check =>
  value =>
    typeof value === 'string' && allowed.includes(value);

/** The fields an author may change inline, per proposed record; keys that name the record are never editable. */
const EDITABLE: Record<string, Record<string, Check>> = {
  entity: { name: value => typeof value === 'string' && value.trim() !== '', notes: text },
  state: { location: text, conditions: list, immediateGoal: text, statusNote: text },
  relationship: { note: text },
  thread: { status: oneOf('open', 'closed'), summary: text, intentionallyOpen: flag },
  mystery: { status: oneOf('open', 'resolved'), question: text, intentionallyOpen: flag },
  knowledge: { how: value => typeof value === 'string' && value.trim() !== '' },
  milestone: { reached: flag },
};

function recordOf(change: ProposedChange): [string, Record<string, unknown>] {
  switch (change.category) {
    case 'entity':
      return ['entity', change.entity as unknown as Record<string, unknown>];
    case 'appearance':
      return ['appearance', change];
    case 'character_state':
      return ['state', change.state as unknown as Record<string, unknown>];
    case 'relationship':
      return ['relationship', change.relationship as unknown as Record<string, unknown>];
    case 'promise':
      return 'thread' in change ? ['thread', change.thread as unknown as Record<string, unknown>] : ['mystery', change.mystery as unknown as Record<string, unknown>];
    case 'knowledge':
    case 'milestone':
      return [change.category, change];
  }
}

/** The proposed change with the author's inline edit laid over it, or the reason the edit is refused. */
export function editedChange(proposed: ProposedChange, patch: Record<string, unknown>): { change: ProposedChange } | { refused: string } {
  const [record, fields] = recordOf(proposed);
  const editable = EDITABLE[record];
  if (!editable) return { refused: 'an appearance has nothing to edit — keep or skip it' };
  const entries = Object.entries(patch);
  if (entries.length === 0) return { refused: 'nothing was changed' };
  for (const [field, value] of entries) {
    const check = editable[field];
    if (!check) return { refused: `${field} cannot be edited here` };
    if (!check(value)) return { refused: `${field} has the wrong shape` };
  }
  const merged = { ...fields, ...Object.fromEntries(entries.map(([field, value]) => [field, value ?? undefined])) };
  if (record === 'knowledge' || record === 'milestone') return { change: merged as unknown as ProposedChange };
  const nested = record === 'state' ? 'state' : record;
  return { change: { category: proposed.category, [nested]: merged } as unknown as ProposedChange };
}

/** The value an item applies: the author's inline edit when there is one, else what the extractor proposed. */
export function effectiveChange(item: Pick<FinalizeReview.Item, 'proposed' | 'edited' | 'decision'>): ProposedChange {
  return (item.decision === 'edited' && item.edited ? item.edited : item.proposed) as ProposedChange;
}

/** Items the author still has to answer: consequential ones one by one, routine ones as a batch; a skip or keep is never asked again. */
export function openItems<T extends Pick<FinalizeReview.Item, 'decision'>>(items: readonly T[]): T[] {
  return items.filter(item => item.decision === null);
}
