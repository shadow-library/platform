import { describe, expect, it } from 'bun:test';

import { formatCost, formatMillis, formatSeconds, formatTokens, resolveRunView, runDuration, runIds, runsBackLabel, runTitle, runTotals, sectionShare } from '../src/lib/runs';

interface Run {
  id: string;
}

function apiError(status: number): { status: number } {
  return { status };
}

describe('resolveRunView', () => {
  const base = { runId: 'run-1', run: undefined, isLoading: false, error: null };

  it('should show the directory when no run is selected', () => {
    expect(resolveRunView({ ...base, runId: undefined })).toEqual({ kind: 'directory' });
  });

  it('should show the directory with a warning when the selected run is gone', () => {
    expect(resolveRunView({ ...base, error: apiError(404) })).toEqual({ kind: 'missing' });
  });

  it('should prefer a resolved run over a stale non-404 error', () => {
    const run: Run = { id: 'run-1' };
    expect(resolveRunView({ ...base, run, error: apiError(500) })).toEqual({ kind: 'detail', run });
  });

  it('should treat a 404 as a dead link even when a stale run is still cached', () => {
    expect(resolveRunView({ ...base, run: { id: 'run-1' }, error: apiError(404) })).toEqual({ kind: 'missing' });
  });

  it('should surface a transport failure that has no run to fall back on', () => {
    const error = apiError(503);
    expect(resolveRunView({ ...base, error })).toEqual({ kind: 'failed', error });
  });

  it('should report loading only while the run query is in flight', () => {
    expect(resolveRunView({ ...base, isLoading: true })).toEqual({ kind: 'loading', runId: 'run-1' });
    expect(resolveRunView(base)).toEqual({ kind: 'directory' });
  });
});

describe('runTitle', () => {
  it('should name a run by its graph and target', () => {
    expect(runTitle({ graph: 'draft-chapter', target: 'ch 12' })).toBe('draft-chapter · ch 12');
  });
});

describe('runDuration', () => {
  it('should read in seconds below a minute', () => {
    expect(runDuration({ startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:42.000Z' })).toBe('42s');
  });

  it('should read in minutes and seconds above a minute', () => {
    expect(runDuration({ startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:02:07.000Z' })).toBe('2m 7s');
  });

  it('should measure an in-flight run against now rather than reporting nothing', () => {
    expect(runDuration({ startedAt: '2026-01-01T00:00:00.000Z' }, Date.parse('2026-01-01T00:00:30.000Z'))).toBe('30s');
  });

  it('should never report a negative duration when the clocks disagree', () => {
    expect(runDuration({ startedAt: '2026-01-01T00:01:00.000Z', endedAt: '2026-01-01T00:00:00.000Z' })).toBe('0s');
  });
});

describe('runIds', () => {
  it('should keep the directory order the pager walks', () => {
    expect(runIds([{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b']);
  });
});

describe('runsBackLabel', () => {
  it('should count the directory it returns to', () => {
    expect(runsBackLabel(12)).toBe('All 12 runs');
  });

  it('should name the directory without a count before the list resolves', () => {
    expect(runsBackLabel(undefined)).toBe('Workflow Runs');
  });
});

describe('runTotals', () => {
  it('should total tokens and cost across every call', () => {
    const totals = runTotals([
      { inputTokens: 100, outputTokens: 20, costUsd: '0.0012' },
      { inputTokens: 50, outputTokens: 5, costUsd: '0.0003' },
    ]);
    expect(totals.inputTokens).toBe(150);
    expect(totals.outputTokens).toBe(25);
    expect(totals.costUsd).toBeCloseTo(0.0015, 6);
  });

  it('should treat an unrecorded token count or cost as zero rather than NaN', () => {
    expect(runTotals([{ inputTokens: null, outputTokens: undefined, costUsd: null }])).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });

  it('should total a run with no model calls to zero', () => {
    expect(runTotals([])).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });
});

describe('formatTokens', () => {
  it('should group a token count and dash an unrecorded one', () => {
    expect(formatTokens(12345)).toBe('12,345');
    expect(formatTokens(null)).toBe('—');
    expect(formatTokens(undefined)).toBe('—');
  });
});

describe('formatCost', () => {
  it('should show cost to the sub-cent an operator reconciles against', () => {
    expect(formatCost(0.0012)).toBe('$0.0012');
    expect(formatCost(0)).toBe('$0.0000');
  });

  it('should dash a cost the provider never reported', () => {
    expect(formatCost(null)).toBe('—');
  });
});

describe('formatSeconds', () => {
  it('should render model latency in seconds', () => {
    expect(formatSeconds(1500)).toBe('1.5s');
    expect(formatSeconds(null)).toBe('—');
  });
});

describe('formatMillis', () => {
  it('should render tool latency in milliseconds', () => {
    expect(formatMillis(42)).toBe('42ms');
    expect(formatMillis(null)).toBe('—');
  });
});

describe('sectionShare', () => {
  it('should express a context section as a share of the pack', () => {
    expect(sectionShare(25, 100)).toBe('25%');
  });

  it('should dash a share of an empty pack rather than dividing by zero', () => {
    expect(sectionShare(0, 0)).toBe('—');
  });
});
