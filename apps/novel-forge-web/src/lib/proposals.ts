export type ChangeOp = Record<string, unknown>;

export const NEVER_AUTO_NOTE = 'Applies only when you select it deliberately.';

const GUARDED_OP_TYPES = new Set(['action.finalize', 'action.approve_draft', 'action.apply_continuity', 'action.generate_chapter']);

export function isGuardedOp(op: ChangeOp): boolean {
  return GUARDED_OP_TYPES.has(String(op.op));
}

export function defaultDeclined(changeSet: readonly ChangeOp[]): Set<number> {
  return new Set(changeSet.reduce<number[]>((acc, op, i) => (isGuardedOp(op) ? [...acc, i] : acc), []));
}
