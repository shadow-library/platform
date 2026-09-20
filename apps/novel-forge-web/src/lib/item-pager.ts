export type PagerPosition = { kind: 'unpositioned' } | { kind: 'positioned'; index: number; total: number; previousId: string | null; nextId: string | null };

/**
 * `ids` is the directory's filtered order, re-derived on every render from the collection query the
 * directory read — never remembered across the route change, so a pager that cannot place itself
 * (cold deep link, deleted item, one-item collection) reports `unpositioned` instead of guessing.
 */
export function resolvePagerPosition(currentId: string, ids: readonly string[] | undefined): PagerPosition {
  if (!currentId || ids === undefined || ids.length < 2) return { kind: 'unpositioned' };
  const index = ids.indexOf(currentId);
  if (index < 0) return { kind: 'unpositioned' };
  return { kind: 'positioned', index, total: ids.length, previousId: ids[index - 1] ?? null, nextId: ids[index + 1] ?? null };
}

export function formatPagerPosition(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}
