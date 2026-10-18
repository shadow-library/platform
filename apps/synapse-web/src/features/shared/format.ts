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
  const key = `${options.maximumFractionDigits}:${options.signDisplay ?? 'auto'}`;
  const formatter = USD_FORMATTERS.get(key) ?? new Intl.NumberFormat('en-US', options);
  USD_FORMATTERS.set(key, formatter);
  return formatter.format(value === 0 ? 0 : value);
}

export function formatUsd(value: number): string {
  return formatWith(usdFormat(value), value);
}

export function formatSignedUsd(value: number): string {
  return formatWith(signedUsdFormat(value), value);
}

export function formatRate(rate?: number | null): string {
  return rate == null ? '—' : PERCENT.format(rate);
}
