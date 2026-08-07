const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number): string => String(n).padStart(2, '0');

function toInstant(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(iso?: string | null): string {
  const d = iso ? toInstant(iso) : null;
  if (!d) return '—';
  return `${MONTHS[d.getMonth()] ?? ''} ${pad(d.getDate())}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function successRate(total: number, succeeded: number): string {
  if (total <= 0) return '—';
  return `${Math.round((succeeded / total) * 1000) / 10}%`;
}

export function trimToUndefined(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text === '' ? undefined : text;
}
