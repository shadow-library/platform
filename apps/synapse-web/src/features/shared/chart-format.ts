const DAY_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const COMPACT_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const WHOLE_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const SMALL_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 });

export function formatChartDay(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(time) ? day : DAY_LABEL.format(time);
}

/** The current UTC day is still filling up, so its bar is labelled as partial rather than read as a drop. */
export function chartDayFormatter(today: string | null): (day: string) => string {
  return day => (day === today ? `${formatChartDay(day)} (so far)` : formatChartDay(day));
}

/** Daily API-price costs are often cents, so sub-dollar ticks keep two significant digits instead of rounding every gridline to $0. */
export function formatUsdTick(value: number): string {
  const size = Math.abs(value);
  if (size >= 1000) return COMPACT_USD.format(value);
  return size >= 1 || size === 0 ? WHOLE_USD.format(value) : SMALL_USD.format(value);
}
