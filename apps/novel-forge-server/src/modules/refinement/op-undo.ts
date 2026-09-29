import { type ArtifactState } from './artifact-state';
import { type ChangeOp, changeSetRefs, type ContentOp } from './change-set';
import { OpGraph } from './idea-filter';

export interface OpUndoRecord {
  inverse: ContentOp;
  /** The records the op writes, as they stood just before it applied: an undo must leave them exactly so, or it is refused. */
  beforeState: Record<string, ArtifactState>;
  /** The records the op writes, as its undo left them: a redo applies only over exactly that state. */
  undoneState?: Record<string, ArtifactState>;
}

/**
 * The dependency rule for undoing one change of an applied turn. A change depends on another when it cannot stand without it — it names
 * a record only the other created, or is a page owing the other's entity type — or when it wrote a record the other wrote before it. Undo
 * and redo keep every record's changes a stack: the latest goes first and comes back last.
 */
export class AppliedOpGraph {
  private readonly graph: OpGraph;
  private readonly position: ReadonlyMap<number, number>;

  /** `order` lists the content ops in the order the apply ran them; `existing` the refs that existed before it did. */
  constructor(
    private readonly ops: readonly ChangeOp[],
    existing: ReadonlySet<string>,
    order: readonly number[],
  ) {
    this.graph = new OpGraph(ops, existing);
    this.position = new Map(order.map((index, at) => [index, at]));
  }

  /** The applied ops that cannot stand once `index` is undone, directly or through one another, latest first — the order to undo them in. */
  dependents(index: number, applied: readonly number[]): number[] {
    const found = new Set<number>();
    for (let grew = true; grew;) {
      grew = false;
      const dropped = [index, ...found];
      const kept = applied.filter(candidate => !dropped.includes(candidate));
      for (const candidate of kept) {
        if (!this.graph.stranded(candidate, dropped, kept) && !dropped.some(earlier => this.follows(candidate, earlier))) continue;
        found.add(candidate);
        grew = true;
      }
    }
    return this.byPosition([...found]).reverse();
  }

  /** The undone ops `index` needs back before it can be redone, earliest first — the order to redo them in. */
  prerequisites(index: number, undone: readonly number[], applied: readonly number[]): number[] {
    const kept = [...applied.filter(candidate => candidate !== index), index];
    const needed = undone.filter(candidate => candidate !== index && (this.graph.stranded(index, [candidate], kept) || this.follows(index, candidate)));
    return this.byPosition(needed);
  }

  private follows(later: number, earlier: number): boolean {
    const refs = new Set(changeSetRefs([this.ops[earlier] as ChangeOp]));
    const shares = changeSetRefs([this.ops[later] as ChangeOp]).some(ref => refs.has(ref));
    return shares && this.at(later) > this.at(earlier);
  }

  private at(index: number): number {
    return this.position.get(index) ?? -1;
  }

  private byPosition(indexes: number[]): number[] {
    return indexes.sort((left, right) => this.at(left) - this.at(right));
  }
}
