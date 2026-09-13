import { addDays, DEFAULT_LOCALE, parseISODate, toISODate } from '@shadow-library/ui';

/**
 * "Local" means the browser's own time zone, resolved by the runtime `Intl` default — the same zone
 * `sync-context.tsx#today` already assumes (`toISODate(new Date())`) and the one P1-09 used for the App
 * & sync queue. Tests pin it with `process.env.TZ`. The account's configured `timezone` only steers the
 * server's daily rollover boundary; nothing here reads it.
 */
function toLocalDate(value: string): Date | null {
  const dateOnly = parseISODate(value);
  if (dateOnly) return dateOnly;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface LocalDateOptions {
  month?: 'short' | 'long';
  year?: boolean;
}

/**
 * "3 Sep 2026" by default, day-month-year order. The month name is a fixed table rather than
 * `toLocaleDateString`, because `Intl`'s own short-month form for September varies by locale ("Sep" in
 * `en-US`, "Sept" in `en-GB`) and the app needs one literal spelling everywhere.
 */
export function formatLocalDate(value: string | null | undefined, options: LocalDateOptions = {}): string {
  if (!value) return '';
  const date = toLocalDate(value);
  if (!date) return '';
  const { month = 'short', year = true } = options;
  const monthName = (month === 'long' ? LONG_MONTHS : SHORT_MONTHS)[date.getMonth()];
  return year ? `${date.getDate()} ${monthName} ${date.getFullYear()}` : `${date.getDate()} ${monthName}`;
}

export interface LocalTimeOptions {
  locale?: string;
}

/** Always 24-hour ("11:12"), matching P1-03's `hour12={false}` TimePicker, regardless of the locale's own convention. */
export function formatLocalTime(value: string | null | undefined, options: LocalTimeOptions = {}): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** "Today", "Yesterday", or `formatLocalDate(value)` — `today` is the app's own `YYYY-MM-DD` day key. */
export function formatRelativeDay(value: string | null | undefined, today: string): string {
  if (!value) return '';
  const datePart = value.length > 10 ? value.slice(0, 10) : value;
  if (datePart === today) return 'Today';
  const todayDate = parseISODate(today);
  if (todayDate && datePart === toISODate(addDays(todayDate, -1))) return 'Yesterday';
  return formatLocalDate(value);
}

export interface TimeZoneOption {
  value: string;
  label: string;
}

/** A-04a: every IANA zone the runtime knows, always including the browser's own and (if given) the account's saved zone, so neither ever goes missing from the list. */
export function timeZoneOptions(currentZone?: string | null): TimeZoneOption[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const zones = new Set(supported);
  zones.add(Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (currentZone) zones.add(currentZone);
  return [...zones].sort().map(zone => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}
