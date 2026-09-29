import { requiredEntityTypesForSlug } from '../bible/bible-manifest';
import { type RecordFields } from './artifact-state';
import { type ChangeOp, changeSetRefs, isActionOp } from './change-set';
import { ideaIdOf } from './idea-id';
import { type CardReason, type ChangeSetSplit, opReferences } from './write-policy';

/** A card for one of these reasons rests on the author's own words this turn, so it is theirs to re-raise and never filtered. */
const AUTHOR_BACKED: ReadonlySet<CardReason> = new Set(['just_discussing', 'manual_mode', 'held_for_review', 'depends_on_card']);

export interface IdeaFilterResult {
  split: ChangeSetSplit;
  /** The idea ids of the dropped ops, including those dropped only because they leaned on a dropped one. */
  dropped: string[];
}

/** A model-authored op: a card no author-backed reason holds, or an op applied as an idea without the author's words. */
function isFilterable(split: ChangeSetSplit, index: number): boolean {
  const disposition = split.dispositions[index];
  if (!disposition || isActionOp(split.ops[index] as ChangeOp)) return false;
  return disposition.side === 'direct' ? disposition.source === 'idea' : !AUTHOR_BACKED.has(disposition.reason);
}

/** The ideas a turn's model-authored ops offer, the only ones a rejection can filter. */
export function filterableIdeaIds(split: ChangeSetSplit): string[] {
  return split.ops.flatMap((op, index) => (isFilterable(split, index) ? [ideaIdOf(op)] : []));
}

function requiredEntityTypes(op: ChangeOp): readonly string[] {
  if (op.op !== 'bible_document.upsert' || typeof op.body !== 'string' || op.body.trim() === '') return [];
  return requiredEntityTypesForSlug(op.section, op.slug);
}

class OpGraph {
  constructor(
    private readonly ops: readonly ChangeOp[],
    private readonly current: ReadonlyMap<string, RecordFields>,
  ) {}

  /** Whether op `from` cannot stand without op `to`: it names a record only `to` creates, or it is a page body owing `to`'s entity type. */
  leansOn(from: number, to: number): boolean {
    const created = new Set(this.created([to]));
    const [type] = this.entityTypes([to]);
    return this.names(from).some(ref => created.has(ref)) || (type !== undefined && requiredEntityTypes(this.op(from)).includes(type));
  }

  /** Whether op `index` lost a record or an entity type it needs to dropped ops, with no kept op supplying it instead. */
  stranded(index: number, dropped: readonly number[], kept: readonly number[]): boolean {
    const supplied = new Set(this.created(kept));
    const lost = new Set(this.created(dropped).filter(ref => !supplied.has(ref)));
    if (this.names(index).some(ref => lost.has(ref))) return true;
    const required = requiredEntityTypes(this.op(index));
    if (required.length === 0) return false;
    const keptTypes = this.entityTypes(kept);
    const droppedTypes = this.entityTypes(dropped);
    return !required.some(type => keptTypes.includes(type)) && required.some(type => droppedTypes.includes(type));
  }

  private op(index: number): ChangeOp {
    return this.ops[index] as ChangeOp;
  }

  private created(indexes: readonly number[]): string[] {
    return changeSetRefs(indexes.map(index => this.op(index))).filter(ref => !this.current.has(ref));
  }

  private names(index: number): string[] {
    return [...changeSetRefs([this.op(index)]), ...opReferences(this.op(index))];
  }

  private entityTypes(indexes: readonly number[]): string[] {
    return indexes.flatMap(index => {
      const op = this.op(index);
      return op.op === 'entity.upsert' ? [op.type] : [];
    });
  }
}

/**
 * Drops each model-authored op whose idea the author turned down and whose scope still holds, then every op that cannot stand
 * without a dropped one. An op the author's own words back is never dropped, and neither is anything it leans on — the author re-raised it.
 */
export function dropRejectedIdeas(split: ChangeSetSplit, rejected: ReadonlySet<string>, current: ReadonlyMap<string, RecordFields>): IdeaFilterResult {
  const indexes = split.ops.map((_, index) => index);
  const rejectedIndexes = indexes.filter(index => isFilterable(split, index) && rejected.has(ideaIdOf(split.ops[index] as ChangeOp)));
  if (rejectedIndexes.length === 0) return { split, dropped: [] };

  const graph = new OpGraph(split.ops, current);
  const needed = new Set(indexes.filter(index => !isFilterable(split, index)));
  for (let grew = true; grew;) {
    grew = false;
    for (const candidate of indexes) {
      if (needed.has(candidate) || ![...needed].some(member => graph.leansOn(member, candidate))) continue;
      needed.add(candidate);
      grew = true;
    }
  }

  const dropped = new Set(rejectedIndexes.filter(index => !needed.has(index)));
  for (let grew = dropped.size > 0; grew;) {
    grew = false;
    const kept = indexes.filter(index => !dropped.has(index));
    for (const index of kept) {
      if (needed.has(index) || !graph.stranded(index, [...dropped], kept)) continue;
      dropped.add(index);
      grew = true;
    }
  }
  if (dropped.size === 0) return { split, dropped: [] };

  const kept = indexes.filter(index => !dropped.has(index));
  const position = new Map(kept.map((index, at) => [index, at]));
  const ops = kept.map(index => split.ops[index] as ChangeOp);
  const dispositions = split.dispositions.filter(d => position.has(d.index)).map(d => ({ ...d, index: position.get(d.index) as number }));
  const on = (side: 'direct' | 'card') => dispositions.filter(d => d.side === side).map(d => ops[d.index] as ChangeOp);
  return {
    split: { ops, direct: on('direct'), cards: on('card'), sources: dispositions.flatMap(d => (d.side === 'direct' ? [d.source] : [])), dispositions, held: split.held },
    dropped: [...dropped].map(index => ideaIdOf(split.ops[index] as ChangeOp)),
  };
}
