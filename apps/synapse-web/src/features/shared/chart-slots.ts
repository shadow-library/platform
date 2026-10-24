const PALETTE_SLOTS = 8;

export function cyclicChartSlots(keys: Iterable<string | null>): Map<string | null, number> {
  const unique = new Set(keys);
  const named = [...unique].filter((key): key is string => key !== null).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const ordered: (string | null)[] = unique.has(null) ? [...named, null] : named;
  return new Map(ordered.map((key, index) => [key, (index % PALETTE_SLOTS) + 1]));
}
