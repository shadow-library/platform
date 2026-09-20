export type CollectionView = { kind: 'empty' } | { kind: 'collection' };

export interface CollectionCount {
  label: string;
  value: number;
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.trunc(Math.max(value, 0)).toLocaleString('en-US');
}

/**
 * `total` is the size of the unfiltered collection, so a filter that matches nothing keeps the toolbar
 * on screen — an empty state there would remove the only control that can undo the filter.
 */
export function resolveCollectionView(total: number | undefined, hasEmptySlot: boolean): CollectionView {
  if (!hasEmptySlot) return { kind: 'collection' };
  if (total === undefined) return { kind: 'collection' };
  return total <= 0 ? { kind: 'empty' } : { kind: 'collection' };
}

export function shouldRenderSegments(itemCount: number): boolean {
  return itemCount >= 2;
}

export function shouldRenderSection(total: number): boolean {
  return Number.isFinite(total) && total > 0;
}

export function seeAllCount(total: number, shown: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(shown)) return null;
  return shown < total ? total : null;
}

export function formatCountsStrip(counts: readonly CollectionCount[]): string {
  return counts.map(count => `${formatCount(count.value)} ${count.label}`).join(' · ');
}
