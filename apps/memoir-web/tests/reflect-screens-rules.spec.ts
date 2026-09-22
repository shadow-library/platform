import { describe, expect, it } from 'bun:test';

import { barHeightPx, PLOT_HEIGHT, validateInsightsSearch } from '@/features/insights';
import { coachPollDelay, deriveInsights, reflectSeed } from '@/lib/data';
import { Route as AskRoute } from '@/routes/_account/_app/ai';
import { getRouter } from '@/router';

const TODAY = '2026-08-22';

describe('validateInsightsSearch', () => {
  it('should read the insights period from the address whether it was written as a number or a string', () => {
    expect(validateInsightsSearch({ period: 30 })).toEqual({ period: '30' });
    expect(validateInsightsSearch({ period: '365' })).toEqual({ period: '365' });
    expect(validateInsightsSearch({ period: '7' })).toEqual({ period: undefined });
  });
});

describe('barHeightPx', () => {
  it('should scale the weekday adherence bars against the same max the screen computes', () => {
    const bars = deriveInsights(reflectSeed(TODAY, 'active'), '90').adherenceByWeekday;
    const max = Math.max(...bars.map(bar => bar.value), 1);
    expect(max).toBeGreaterThan(0);

    for (const bar of bars) expect(barHeightPx(bar.value, max)).toBe(Math.max(3, Math.round((bar.value / max) * PLOT_HEIGHT)));
    const tallest = bars.find(bar => bar.value === max);
    expect(barHeightPx(tallest?.value ?? 0, max)).toBe(PLOT_HEIGHT);
  });

  it('should floor a zero-value bar at 3px rather than collapse it to nothing', () => {
    expect(barHeightPx(0, 10)).toBe(3);
  });
});

describe('Ask route search', () => {
  const validateAskSearch = AskRoute.options.validateSearch as (search: Record<string, unknown>) => { ask?: string };

  it('should carry a prefill with special characters through the address unchanged', () => {
    const router = getRouter();
    const ask = 'Why do “Thursdays” & 50% of #mornings slip?\nLine two — 🙂';
    const { href } = router.buildLocation({ to: '/ai', search: { ask } });

    expect(validateAskSearch(router.options.parseSearch(new URL(href, 'http://localhost').search))).toEqual({ ask });
  });

  it('should drop a prefill the server could not accept', () => {
    expect(validateAskSearch({ ask: 'x'.repeat(2001) })).toEqual({ ask: undefined });
    expect(validateAskSearch({ ask: 'x'.repeat(2000) })).toEqual({ ask: 'x'.repeat(2000) });
    expect(validateAskSearch({ ask: '   ' })).toEqual({ ask: undefined });
    expect(validateAskSearch({ ask: 90 })).toEqual({ ask: undefined });
  });
});

describe('coachPollDelay', () => {
  const NOW = Date.parse('2026-08-22T12:00:00.000Z');

  it('should poll a running request every 20 seconds', () => {
    expect(coachPollDelay({ state: 'processing', expectedBy: '' }, NOW, 0)).toBe(20_000);
  });

  it('should check a newly queued request once soon after it is asked', () => {
    expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T22:00:00.000Z' }, NOW, 0, false)).toBe(20_000);
  });

  it('should poll a queued request every 5 minutes until it is expected, then every 20 seconds', () => {
    expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T22:00:00.000Z' }, NOW, 0)).toBe(5 * 60_000);
    expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T12:02:00.000Z' }, NOW, 0)).toBe(2 * 60_000);
    expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T11:00:00.000Z' }, NOW, 0)).toBe(20_000);
  });

  it('should back off after failed refreshes up to 5 minutes', () => {
    const running = { state: 'processing' as const, expectedBy: '' };
    expect([1, 2, 3, 4, 10].map(failures => coachPollDelay(running, NOW, failures))).toEqual([40_000, 80_000, 160_000, 300_000, 300_000]);
  });

  it('should not poll a request that is not waiting', () => {
    expect(coachPollDelay({ state: 'held', expectedBy: '' }, NOW, 0)).toBeNull();
    expect(coachPollDelay({ state: 'failed', expectedBy: '' }, NOW, 0)).toBeNull();
  });
});
