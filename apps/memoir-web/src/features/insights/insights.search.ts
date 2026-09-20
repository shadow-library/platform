import { type InsightPeriod } from '@/lib/data';

export interface InsightsSearch {
  period?: InsightPeriod;
}

const PERIODS: readonly InsightPeriod[] = ['30', '90', '365'];

/** The router parses `?period=30` as a number, so a hand-written link is accepted in either form. */
export function validateInsightsSearch(search: Record<string, unknown>): InsightsSearch {
  const value = typeof search.period === 'number' ? String(search.period) : search.period;
  return { period: PERIODS.find(period => period === value) };
}
