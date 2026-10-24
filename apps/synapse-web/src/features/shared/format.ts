const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

const INTEGER = new Intl.NumberFormat('en-US');
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const USD_FORMATTERS = new Map<string, Intl.NumberFormat>();

/** Always UTC: the server render and the browser's hydration must print the same text whatever the viewer's zone. */
export function formatDateTime(iso?: string | null): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return `${MONTHS[date.getUTCMonth()] ?? ''} ${pad(date.getUTCDate())}, ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function formatDate(iso?: string | null): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return `${MONTHS[date.getUTCMonth()] ?? ''} ${pad(date.getUTCDate())}, ${date.getUTCFullYear()}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_DAYS = 30;

/** Depends on the clock, so render it only after hydration; a future instant (clock skew) reads as just now. */
export function formatRelativeTime(iso: string, now: Date): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '—';
  const elapsed = now.getTime() - time;
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  const days = Math.floor(elapsed / DAY_MS);
  if (days <= RELATIVE_DAYS) return days === 1 ? 'yesterday' : `${days} days ago`;
  return formatDate(iso);
}

export function formatNumber(value: number): string {
  return INTEGER.format(value);
}

/** Sub-dollar list costs are routinely fractions of a cent, so they keep four decimals rather than rounding to $0.00. */
export function usdFormat(value: number): Intl.NumberFormatOptions {
  const digits = Math.abs(value) >= 1 || value === 0 ? 2 : 4;
  return { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits };
}

export function signedUsdFormat(value: number): Intl.NumberFormatOptions {
  return { ...usdFormat(value), signDisplay: 'exceptZero' };
}

function formatWith(options: Intl.NumberFormatOptions, value: number): string {
  const key = `${options.minimumFractionDigits}:${options.maximumFractionDigits}:${options.signDisplay ?? 'auto'}`;
  const formatter = USD_FORMATTERS.get(key) ?? new Intl.NumberFormat('en-US', options);
  USD_FORMATTERS.set(key, formatter);
  return formatter.format(value === 0 ? 0 : value);
}

export function formatUsd(value: number): string {
  return formatWith(usdFormat(value), value);
}

/** Catalog prices per million tokens: cents, plus as many as two more decimals when the price has them, so a sub-cent change stays visible. */
export function formatPrice(value: number): string {
  return formatWith({ style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }, value);
}

export function formatSignedUsd(value: number): string {
  return formatWith(signedUsdFormat(value), value);
}

export function formatRate(rate?: number | null): string {
  return rate == null ? '—' : PERCENT.format(rate);
}
