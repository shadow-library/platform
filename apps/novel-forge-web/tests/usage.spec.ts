import { describe, expect, it } from 'bun:test';

import { type AiQuotaResponse, type CostBreakdownItem } from '../src/lib/apis/api-types.gen';
import {
  barPercent,
  breakdownRows,
  callCharge,
  callRoleLabel,
  chargeRows,
  contentModeLabel,
  dailyCharges,
  dayBars,
  estimateFooter,
  formatCompactTokens,
  formatUsd,
  groupLabel,
  isUsagePeriod,
  pageRange,
  periodCharge,
  periodFooter,
  periodStart,
  quotaMeter,
  quotaWindowLabel,
  runLabel,
  tierLabel,
} from '../src/lib/usage';

const NOW = new Date('2026-09-26T12:00:00.000Z');

function item(key: string, costUsd: number, extra: Partial<CostBreakdownItem> = {}): CostBreakdownItem {
  return { key, label: key, calls: 2, inputTokens: 1000, outputTokens: 200, costUsd, estimatedCostUsd: 0, ...extra };
}

function quota(overrides: Partial<AiQuotaResponse> = {}): AiQuotaResponse {
  return { calls: 48, costUsd: 3.1, maxCalls: 1000, maxCostUsd: 50, windowMs: 3_600_000, resetsAt: '2026-09-26T14:00:00.000Z', ...overrides };
}

describe('formatUsd', () => {
  it('should keep cents for amounts of ten cents or more', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.92)).toBe('$0.92');
    expect(formatUsd(19.754)).toBe('$19.75');
  });

  it('should show a tenth of a cent for small charges so a cheap reply never reads as free', () => {
    expect(formatUsd(0.041)).toBe('$0.041');
    expect(formatUsd(0.0012)).toBe('$0.001');
    expect(formatUsd(0.0996)).toBe('$0.10');
    expect(formatUsd(0.0994)).toBe('$0.099');
  });

  it('should never round a positive charge down to zero', () => {
    expect(formatUsd(0.0004)).toBe('<$0.001');
  });
});

describe('formatCompactTokens', () => {
  it('should compact thousands and millions the way the canvas reads them', () => {
    expect(formatCompactTokens(950)).toBe('950');
    expect(formatCompactTokens(14_200)).toBe('14.2k');
    expect(formatCompactTokens(96_000)).toBe('96k');
    expect(formatCompactTokens(310_400)).toBe('310k');
    expect(formatCompactTokens(1_900_000)).toBe('1.9M');
    expect(formatCompactTokens(2_000_000)).toBe('2M');
  });
});

describe('barPercent', () => {
  it('should keep a sliver visible for a small share and fill the largest', () => {
    expect(barPercent(1, 1000)).toBe(4);
    expect(barPercent(1000, 1000)).toBe(100);
    expect(barPercent(5, 0)).toBe(4);
  });
});

describe('periodCharge', () => {
  const totals = { totalCostUsd: 19.75, last7DaysCostUsd: 4.82, last30DaysCostUsd: 11.4 };

  it('should read the figure for the chosen period', () => {
    expect(periodCharge(totals, 'week')).toBe(4.82);
    expect(periodCharge(totals, 'month')).toBe(11.4);
    expect(periodCharge(totals, 'all')).toBe(19.75);
  });
});

describe('periodStart', () => {
  it('should filter runs from seven or thirty days back and not at all for all time', () => {
    expect(periodStart('week', NOW)).toBe('2026-09-19T12:00:00.000Z');
    expect(periodStart('month', NOW)).toBe('2026-08-27T12:00:00.000Z');
    expect(periodStart('all', NOW)).toBeUndefined();
  });
});

describe('isUsagePeriod', () => {
  it('should accept only the three periods', () => {
    expect(isUsagePeriod('week')).toBe(true);
    expect(isUsagePeriod('year')).toBe(false);
  });
});

describe('dailyCharges', () => {
  it('should zero-fill the days the server omits, oldest first, ending today', () => {
    const days = dailyCharges([{ day: '2026-09-24', calls: 3, costUsd: 0.5 }], 7, NOW);
    expect(days.map(day => day.day)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']);
    expect(days[4]).toEqual({ day: '2026-09-24', label: 'Thu', calls: 3, costUsd: 0.5 });
    expect(days[5]?.costUsd).toBe(0);
  });

  it('should label every fifth day of a month, counting back from today', () => {
    const days = dailyCharges([], 30, NOW);
    expect(days).toHaveLength(30);
    expect(days.filter(day => day.label).map(day => day.label)).toEqual(['1', '6', '11', '16', '21', '26']);
  });
});

describe('dayBars', () => {
  it('should leave a day with no charge empty instead of drawing the minimum sliver', () => {
    const bars = dayBars([{ day: '2026-09-26', calls: 1, costUsd: 0.2 }], 7, NOW);
    expect(bars.at(-1)?.pct).toBe(100);
    expect(bars[0]?.pct).toBe(0);
    expect(bars.at(-1)?.tip).toBe('2026-09-26 · 1 call · $0.20');
  });
});

describe('chargeRows', () => {
  it('should size each row by its charge, keep the amount and flag an estimated part', () => {
    const rows = chargeRows([item('writing', 2), item('chat', 0.5, { estimatedCostUsd: 0.25 }), item('image', 0)], groupLabel);
    expect(rows.map(row => row.pct)).toEqual([100, 25, 0]);
    expect(rows[1]).toEqual({ key: 'chat', label: 'Chat', pct: 25, amount: '$0.50', estimated: true });
  });
});

describe('periodFooter', () => {
  it('should state the estimate for all time and warn about it for a shorter period', () => {
    expect(periodFooter('all', 0.4)).toBe('All time · $0.40 estimated');
    expect(periodFooter('week', 0.4)).toBe('Last 7 days · may include estimates');
    expect(periodFooter('month', 0)).toBe('Last 30 days');
  });
});

describe('breakdownRows', () => {
  it('should carry tokens only when asked', () => {
    expect(breakdownRows([item('m', 1)], row => row.label, true)[0]?.tokens).toBe('1,000 / 200');
    expect(breakdownRows([item('m', 1)], row => row.label)[0]?.tokens).toBeUndefined();
  });
});

describe('estimateFooter', () => {
  it('should mention an estimate only when part of the figure was estimated', () => {
    expect(estimateFooter('All time', 0)).toBe('All time');
    expect(estimateFooter('All time', 0.4)).toBe('All time · $0.40 estimated');
  });
});

describe('labels', () => {
  it('should name model groups, tiers and content modes for the author', () => {
    expect(groupLabel('helper')).toBe('Helpers');
    expect(groupLabel('bible:canon')).toBe('Canon');
    expect(tierLabel('performant')).toBe('Performant');
    expect(contentModeLabel('unrestricted')).toBe('Unrestricted');
    expect(tierLabel('custom-tier')).toBe('Custom tier');
  });

  it('should name call roles and fall back to the role itself', () => {
    expect(callRoleLabel('generation')).toBe('Draft');
    expect(callRoleLabel('chapter-summarize')).toBe('Summary');
    expect(callRoleLabel('new-role')).toBe('New role');
  });
});

describe('runLabel', () => {
  it('should name a chapter run after its chapter', () => {
    expect(runLabel({ graph: 'chapter-generation', target: 'chapter-4' })).toBe('Write chapter 4');
  });

  it('should name other runs by what they did', () => {
    expect(runLabel({ graph: 'bible-audit', target: 'bible' })).toBe('Story Bible audit');
    expect(runLabel({ graph: 'future-graph', target: 'x' })).toBe('Future graph');
  });
});

describe('callCharge', () => {
  const price = { inputPricePerMToken: 3, outputPricePerMToken: 15 };

  it('should treat provider and gateway costs as the real charge', () => {
    expect(callCharge({ costUsd: '0.041', costSource: 'gateway' })).toEqual({ usd: 0.041, estimated: false });
    expect(callCharge({ costUsd: '0.5', costSource: 'provider' })).toEqual({ usd: 0.5, estimated: false });
  });

  it('should flag only a list-price cost as an estimate', () => {
    expect(callCharge({ costUsd: '0.02', costSource: 'estimate' })).toEqual({ usd: 0.02, estimated: true });
  });

  it('should charge nothing for a classified call that recorded no cost', () => {
    expect(callCharge({ costUsd: null, costSource: 'provider', inputTokens: 1000 }, price)).toEqual({ usd: 0, estimated: false });
  });

  it('should price a legacy call from list prices so the lines add up to the run', () => {
    expect(callCharge({ costUsd: null, costSource: null, inputTokens: 1_000_000, outputTokens: 100_000 }, price)).toEqual({ usd: 4.5, estimated: true });
    expect(callCharge({ costUsd: null, costSource: null, inputTokens: 0, outputTokens: 0 }, price)).toEqual({ usd: 0, estimated: false });
  });

  it('should leave a legacy call unknown until the model registry loads', () => {
    expect(callCharge({ costUsd: null, costSource: null, inputTokens: 10 })).toEqual({ usd: null, estimated: true });
  });

  it('should charge nothing for a legacy call on a model the registry does not price, as the server does', () => {
    expect(callCharge({ costUsd: null, costSource: null, inputTokens: 10 }, null)).toEqual({ usd: 0, estimated: false });
  });
});

describe('quotaWindowLabel', () => {
  it('should name the rolling window in plain words', () => {
    expect(quotaWindowLabel(3_600_000)).toBe('Hourly limit');
    expect(quotaWindowLabel(5 * 3_600_000)).toBe('5-hour limit');
    expect(quotaWindowLabel(86_400_000)).toBe('Daily limit');
    expect(quotaWindowLabel(7 * 86_400_000)).toBe('7-day limit');
    expect(quotaWindowLabel(15 * 60_000)).toBe('15-minute limit');
  });
});

describe('quotaMeter', () => {
  it('should fill the meter by whichever limit is closer', () => {
    const meter = quotaMeter(quota({ calls: 800 }));
    expect(meter.spend).toEqual({ used: 3.1, limit: 50, pct: 6 });
    expect(meter.calls).toEqual({ used: 800, limit: 1000, pct: 80 });
    expect(meter.pct).toBe(80);
    expect(meter.intent).toBe('success');
  });

  it('should turn to danger near the limit and cap at a full bar', () => {
    const meter = quotaMeter(quota({ costUsd: 60 }));
    expect(meter.pct).toBe(100);
    expect(meter.intent).toBe('danger');
  });

  it('should ignore a disabled dimension', () => {
    const meter = quotaMeter(quota({ maxCostUsd: 0, maxCalls: 0, resetsAt: null }));
    expect(meter.spend).toBeUndefined();
    expect(meter.calls).toBeUndefined();
    expect(meter.pct).toBe(0);
    expect(meter.resetsAt).toBeNull();
  });
});

describe('pageRange', () => {
  it('should describe the visible slice and which way the author can page', () => {
    expect(pageRange(0, 20, 45)).toEqual({ from: 1, to: 20, hasPrevious: false, hasNext: true });
    expect(pageRange(40, 5, 45)).toEqual({ from: 41, to: 45, hasPrevious: true, hasNext: false });
    expect(pageRange(0, 0, 0)).toEqual({ from: 0, to: 0, hasPrevious: false, hasNext: false });
  });
});
