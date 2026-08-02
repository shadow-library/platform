/**
 * Formatting helpers shared across feature pages.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number): string => String(n).padStart(2, '0');

/** An unparseable instant reads as an em dash rather than rendering "NaN" into the page. */
function toInstant(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Jul 11, 2026 15:20" — em dash when absent. Takes a `date-time`; renders in the viewer's zone. */
export function formatDateTime(iso?: string | null): string {
  const d = iso ? toInstant(iso) : null;
  if (!d) return '—';
  return `${MONTHS[d.getMonth()] ?? ''} ${pad(d.getDate())}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Jul 11, 2026" — em dash when absent. Takes a `date-time`; renders in the viewer's zone. */
export function formatDate(iso?: string | null): string {
  const d = iso ? toInstant(iso) : null;
  if (!d) return '—';
  return `${MONTHS[d.getMonth()] ?? ''} ${pad(d.getDate())}, ${d.getFullYear()}`;
}

/**
 * "Jul 11" — short axis/label form for an ISO calendar date (`YYYY-MM-DD`), em dash when unparseable.
 *
 * Read field-by-field rather than through `Date`: a calendar day carries no zone, but `Date` would parse
 * it as UTC midnight and `getDate()` would then shift it a day backwards for every viewer west of UTC.
 */
export function formatDay(date: string): string {
  const match = CALENDAR_DATE.exec(date);
  if (!match) return '—';
  const [, , month, day] = match;
  return `${MONTHS[Number(month) - 1] ?? ''} ${Number(day)}`;
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
