import { enforcePlanWrite } from '@server/common';
import { type DbExecutor, type Refinement } from '@server/database';

import { type ArtifactState, MISSING_ARTIFACT } from '../artifact-state';
import { type ChangeOp, type ContentOp } from '../change-set';

/** An op's value for a field, or the row's when the op leaves it out; only a restore op's `null` clears it. */
export function keptOr<T>(value: T | null | undefined, existing: T | null | undefined): T | null {
  return value === undefined ? (existing ?? null) : value;
}

/** Removals run last (volumes, then milestones) because the op that releases a brief, plan claim or fact unlock may be listed after the removal. */
export function removalsLast<T extends { op: string }>(ops: readonly T[]): T[] {
  const removal = (kind: string) => ops.filter(op => op.op === kind);
  return [...ops.filter(op => op.op !== 'volume.remove' && op.op !== 'milestone.remove'), ...removal('volume.remove'), ...removal('milestone.remove')];
}

export const PLAN_STATE_OPS: ReadonlySet<string> = new Set([
  'brief.update',
  'brief.remove',
  'volume.upsert',
  'volume.remove',
  'fact.upsert',
  'fact.remove',
  'milestone.upsert',
  'milestone.remove',
]);

/** A chat turn's applied proposal: the only kind whose changes are undone and redone one at a time. */
export const PER_OP_UNDO_KINDS: ReadonlySet<Refinement.Kind> = new Set(['chat', 'hub']);

/** Whether every ref holds the expected content; revisions are left out, since a restore bumps them. */
export function sameContent(refs: readonly string[], expected: Readonly<Record<string, ArtifactState>>, actual: Readonly<Record<string, ArtifactState>>): boolean {
  return refs.every(ref => {
    const want = expected[ref];
    const found = actual[ref] ?? MISSING_ARTIFACT;
    return want !== undefined && want.exists === found.exists && want.contentHash === found.contentHash;
  });
}

/** The change-set indexes in the order an apply runs their ops. */
export function applyOrder(ops: readonly ChangeOp[], indexes: readonly number[]): number[] {
  return removalsLast(indexes.map(index => ({ op: (ops[index] as ChangeOp).op, index }))).map(entry => entry.index);
}

/** Plans, and the facts, volumes and milestones their reveal rule reads, are checked as the whole change-set leaves them, so one op may rely on another. */
export async function enforcePlanOps(tx: DbExecutor, projectId: bigint, ops: readonly ContentOp[]): Promise<void> {
  if (!ops.some(op => PLAN_STATE_OPS.has(op.op))) return;
  const written = ops.flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
  await enforcePlanWrite(tx, projectId, written);
}
