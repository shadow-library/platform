export interface Distribution {
  n: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  mean: number | null;
}

/** Nearest-rank percentile: with the small n these suites produce, an interpolated p95 would report a value no run ever took. */
function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { n: 0, p50: null, p95: null, max: null, mean: null };
  return {
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

export function formatRate(hits: number, n: number): string {
  if (n === 0) return 'n/a (n=0)';
  return `${((hits / n) * 100).toFixed(1)}% (${hits}/${n})`;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  return groups;
}

export function table(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const line = (cells: readonly (string | number)[]): string => `| ${cells.map(cell => String(cell).replace(/\|/g, '\\|')).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}
