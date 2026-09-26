import { and, eq, inArray, ne, or } from 'drizzle-orm';

import { type BriefScene, type DbExecutor, type Generation, type Knowledge, schema } from '@server/database';

import { type BriefUpdateOp, type ChangeOp, changeSetRefs, type ContentOp } from './change-set';
import { opReferences } from './write-policy';

export type UndoDependentKind = 'plan' | 'draft' | 'knowledge' | 'suggestion';

export interface UndoDependent {
  kind: UndoDependentKind;
  /** `chapter:<n>`, `draft:<n>`, `knowledge:<entityKey>/<factKey>` or `proposal:<id>`. */
  ref: string;
  chapter: number | null;
  /** The undone record this one relies on. */
  because: string;
  /** Finalized history, which undo never rewrites: the author sees it, the revert leaves it as it is. */
  final: boolean;
}

export interface UndoImpact {
  dependents: UndoDependent[];
  /** Finalized plans and drafts that only relied on an updated record: counted, not listed, since the undo leaves them exactly as they are. */
  finalUnaffected: number;
}

/** What the reverted proposal did to each record: created ones vanish on undo, updated ones only go back to their earlier value. */
export interface UndoneChange {
  created: readonly string[];
  updated: readonly string[];
}

export interface ImpactPlanRow {
  chapter: number;
  volumeKey: string | null;
  pov: string | null;
  scenes: BriefScene[] | null;
  knowledgeContract: unknown;
  claimedMilestones: string[] | null;
  contextRefs: string[] | null;
}

export interface ImpactDraftRow {
  chapter: number;
  status: Generation.Draft['status'];
}

export interface ImpactKnowledgeRow {
  factKey: string;
  entityKey: string;
  learnedInChapter: number;
  status: Knowledge.CharacterKnowledge['status'];
}

export interface ImpactSuggestionRow {
  id: bigint;
  changeSet: unknown;
  baseline: unknown;
}

export interface ImpactRows {
  plans: readonly ImpactPlanRow[];
  drafts: readonly ImpactDraftRow[];
  knowledge: readonly ImpactKnowledgeRow[];
  suggestions: readonly ImpactSuggestionRow[];
}

interface Candidate extends UndoDependent {
  root: string;
}

const KIND_ORDER: readonly UndoDependentKind[] = ['plan', 'draft', 'knowledge', 'suggestion'];

/** A record the proposal created inverts to its removal; every other ref it touched was an update. */
export function undoneChange(postStateRefs: readonly string[], inverseOps: readonly ContentOp[]): UndoneChange {
  const created = new Set(changeSetRefs(inverseOps.filter(op => op.op.endsWith('.remove'))));
  return { created: postStateRefs.filter(ref => created.has(ref)), updated: postStateRefs.filter(ref => !created.has(ref)) };
}

function planReferences(plan: ImpactPlanRow): string[] {
  const asOp: BriefUpdateOp = {
    op: 'brief.update',
    chapter: plan.chapter,
    volumeKey: plan.volumeKey,
    pov: plan.pov ?? undefined,
    scenes: plan.scenes,
    knowledgeContract: plan.knowledgeContract as BriefUpdateOp['knowledgeContract'],
    claimedMilestones: plan.claimedMilestones,
    contextRefs: plan.contextRefs ?? undefined,
  };
  return opReferences(asOp);
}

function suggestionReferences(row: ImpactSuggestionRow): string[] {
  const ops = Array.isArray(row.changeSet) ? (row.changeSet as ChangeOp[]) : [];
  return [...Object.keys((row.baseline ?? {}) as Record<string, unknown>), ...ops.flatMap(opReferences)];
}

function candidates(changed: ReadonlySet<string>, rows: ImpactRows): Candidate[] {
  const drafts = new Map(rows.drafts.map(draft => [draft.chapter, draft]));
  const found: Candidate[] = [];
  const draftOf = (chapter: number, because: string, root: string) => {
    const draft = drafts.get(chapter);
    if (draft) found.push({ kind: 'draft', ref: `draft:${chapter}`, chapter, because, final: draft.status === 'final', root });
  };

  for (const plan of rows.plans) {
    const root = planReferences(plan).find(ref => changed.has(ref));
    if (!root || changed.has(`chapter:${plan.chapter}`)) continue;
    found.push({ kind: 'plan', ref: `chapter:${plan.chapter}`, chapter: plan.chapter, because: root, final: drafts.get(plan.chapter)?.status === 'final', root });
    draftOf(plan.chapter, `chapter:${plan.chapter}`, root);
  }

  for (const ref of changed) {
    if (ref.startsWith('chapter:')) draftOf(Number(ref.slice('chapter:'.length)), ref, ref);
    if (!ref.startsWith('draft:')) continue;
    const chapter = Number(ref.slice('draft:'.length));
    for (const draft of rows.drafts) if (draft.chapter > chapter) draftOf(draft.chapter, ref, ref);
  }

  for (const row of rows.knowledge) {
    const root = [`fact:${row.factKey}`, `entity:${row.entityKey}`].find(ref => changed.has(ref));
    if (root)
      found.push({ kind: 'knowledge', ref: `knowledge:${row.entityKey}/${row.factKey}`, chapter: row.learnedInChapter, because: root, final: row.status === 'committed', root });
  }

  for (const row of rows.suggestions) {
    const root = suggestionReferences(row).find(ref => changed.has(ref));
    if (root) found.push({ kind: 'suggestion', ref: `proposal:${row.id}`, chapter: null, because: root, final: false, root });
  }
  return found;
}

/**
 * What undoing a change would leave standing on records it no longer backs. A created record vanishes, so everything that names it is
 * listed: plans, the drafts written from them, knowledge about it and pending suggestions. An updated record only returns to its earlier
 * value, so finalized plans and drafts are counted rather than listed, and what a character knows is unaffected by a character's field.
 */
export function undoImpact(change: UndoneChange, rows: ImpactRows): UndoImpact {
  const created = new Set(change.created);
  const kept = new Map<string, UndoDependent>();
  const finalUnaffected = new Set<string>();

  for (const { root, ...dependent } of candidates(new Set([...change.created, ...change.updated]), rows)) {
    const key = `${dependent.kind}|${dependent.ref}`;
    const updatedOnly = !created.has(root);
    if (updatedOnly && dependent.kind === 'knowledge' && root.startsWith('entity:')) continue;
    if (updatedOnly && dependent.final && (dependent.kind === 'plan' || dependent.kind === 'draft')) {
      finalUnaffected.add(key);
      continue;
    }
    if (!kept.has(key)) kept.set(key, dependent);
  }

  const dependents = [...kept.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.chapter ?? 0) - (b.chapter ?? 0) || a.ref.localeCompare(b.ref),
  );
  const listed = new Set(dependents.map(dependent => `${dependent.kind}|${dependent.ref}`));
  return { dependents, finalUnaffected: [...finalUnaffected].filter(key => !listed.has(key)).length };
}

function keysOf(refs: readonly string[], prefix: string): string[] {
  return refs.filter(ref => ref.startsWith(prefix)).map(ref => ref.slice(prefix.length));
}

export async function loadImpactRows(db: DbExecutor, projectId: bigint, proposalId: bigint, changedRefs: readonly string[]): Promise<ImpactRows> {
  const factKeys = keysOf(changedRefs, 'fact:');
  const entityKeys = keysOf(changedRefs, 'entity:');
  const knowledgeFilter = or(
    factKeys.length > 0 ? inArray(schema.canonFacts.factKey, factKeys) : undefined,
    entityKeys.length > 0 ? inArray(schema.entities.entityKey, entityKeys) : undefined,
  );

  const [plans, drafts, knowledge, suggestions] = await Promise.all([
    db.query.briefs.findMany({
      where: eq(schema.briefs.projectId, projectId),
      columns: { chapter: true, volumeKey: true, pov: true, scenes: true, knowledgeContract: true, claimedMilestones: true, contextRefs: true },
    }),
    db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), columns: { chapter: true, status: true } }),
    knowledgeFilter
      ? db
          .select({
            factKey: schema.canonFacts.factKey,
            entityKey: schema.entities.entityKey,
            learnedInChapter: schema.characterKnowledge.learnedInChapter,
            status: schema.characterKnowledge.status,
          })
          .from(schema.characterKnowledge)
          .innerJoin(schema.canonFacts, eq(schema.canonFacts.id, schema.characterKnowledge.factId))
          .innerJoin(schema.entities, eq(schema.entities.id, schema.characterKnowledge.entityId))
          .where(and(eq(schema.characterKnowledge.projectId, projectId), knowledgeFilter))
      : [],
    db.query.refinementProposals.findMany({
      where: and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.status, 'pending'), ne(schema.refinementProposals.id, proposalId)),
      columns: { id: true, changeSet: true, baseline: true },
    }),
  ]);
  return { plans, drafts, knowledge, suggestions };
}
