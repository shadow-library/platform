const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

const INTEGER = new Intl.NumberFormat('en-US');
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

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
export function formatUsd(value: number): string {
  const digits = Math.abs(value) >= 1 || value === 0 ? 2 : 4;
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(digits)}`;
}

export function formatSignedUsd(value: number): string {
  return value > 0 ? `+${formatUsd(value)}` : formatUsd(value);
}

export function formatRate(rate?: number | null): string {
  return rate == null ? '—' : PERCENT.format(rate);
}
