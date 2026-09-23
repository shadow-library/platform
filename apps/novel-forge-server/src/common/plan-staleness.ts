/**
 * Why an arc or a brief stopped matching the shape above it. The values are stored on the row, so they are a
 * closed vocabulary rather than prose, and never reach the author unlabelled.
 */
export const PLAN_STALE_VOLUME_CHANGED = 'volume_changed';
export const PLAN_STALE_RANGE_SHIFTED = 'volume_range_shifted';
export const PLAN_STALE_ARC_CHANGED = 'arc_changed';

const PLAN_STALE_REASON_LABELS: Record<string, string> = {
  [PLAN_STALE_VOLUME_CHANGED]: 'the volume was rewritten',
  [PLAN_STALE_RANGE_SHIFTED]: 'the volume’s chapter range moved',
  [PLAN_STALE_ARC_CHANGED]: 'the arc was rewritten',
};

export function planStaleLabel(reason: string): string {
  return PLAN_STALE_REASON_LABELS[reason] ?? reason;
}
