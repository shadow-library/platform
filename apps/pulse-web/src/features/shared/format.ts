/**
 * Formatting helpers shared across feature pages.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** "Jul 11, 2026 15:20" — em dash when absent. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()] ?? ''} ${pad(d.getDate())}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Jul 11, 2026" — em dash when absent. */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()] ?? ''} ${pad(d.getDate())}, ${d.getFullYear()}`;
}

/** "Jul 11" — short axis/label form. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()] ?? ''} ${d.getDate()}`;
}

/** Grouped integer, e.g. 6120 → "6,120". */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Success percentage to one decimal, e.g. "95.5%". */
export function successRate(total: number, succeeded: number): string {
  if (total <= 0) return '—';
  return `${Math.round((succeeded / total) * 1000) / 10}%`;
}

/** Trims a form value to a string, collapsing empties to `undefined` (for optional API fields). */
export function trimToUndefined(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text === '' ? undefined : text;
}
