import { type BudgetWindow } from '@modules/catalog';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const WINDOW_MS: Record<BudgetWindow, number> = { '1h': HOUR_MS, '1d': DAY_MS, '30d': 30 * DAY_MS };

/** Fixed buckets counted from the epoch, so the hour and the day are UTC and every replica computes the same start */
export function windowStart(window: BudgetWindow, now: Date): Date {
  const size = WINDOW_MS[window];
  return new Date(Math.floor(now.getTime() / size) * size);
}
