import { describe, expect, it } from 'bun:test';

import { type BibleReadinessDimension, type BibleReadinessDimensionResponse, type BibleReadinessResponse, type BibleReadinessVerdict } from '../src/lib/apis/api-types.gen';
import {
  advisoryGaps,
  DIMENSION_HINT,
  DIMENSION_LABEL,
  DIMENSION_ORDER,
  dimensionRatio,
  isBlocking,
  orderedDimensions,
  readinessHeadline,
  readinessIntent,
  verdictIntent,
} from '../src/lib/bible-readiness';

function dimension(name: BibleReadinessDimension, verdict: BibleReadinessVerdict, gaps: string[] = []): BibleReadinessDimensionResponse {
  const total = gaps.length + 1;
  return { dimension: name, verdict, satisfied: verdict === 'strong' ? total : verdict === 'thin' ? 1 : 0, total, gaps };
}

function report(dimensions: BibleReadinessDimensionResponse[], blockingGaps: string[] = []): BibleReadinessResponse {
  return { dimensions, readyToDraft: blockingGaps.length === 0, blockingGaps };
}

const allStrong = DIMENSION_ORDER.map(name => dimension(name, 'strong'));

describe('verdictIntent', () => {
  it('should map each verdict to the chip intent that reads at a glance', () => {
    expect(verdictIntent('strong')).toBe('success');
    expect(verdictIntent('thin')).toBe('warning');
    expect(verdictIntent('empty')).toBe('danger');
  });
});

describe('isBlocking', () => {
  it('should treat coverage and records as the gates, matching the server', () => {
    expect(isBlocking('coverage')).toBe(true);
    expect(isBlocking('records')).toBe(true);
  });

  it('should treat the rest as advisory', () => {
    expect(isBlocking('substance')).toBe(false);
    expect(isBlocking('integrity')).toBe(false);
    expect(isBlocking('reveal')).toBe(false);
  });
});

describe('dimensionRatio', () => {
  it('should read as satisfied over total', () => {
    expect(dimensionRatio(dimension('coverage', 'thin', ['a', 'b']))).toBe('1/3');
  });

  it('should read as not applicable when the dimension had nothing to judge', () => {
    expect(dimensionRatio({ dimension: 'substance', verdict: 'strong', satisfied: 0, total: 0, gaps: [] })).toBe('n/a');
  });
});

describe('orderedDimensions', () => {
  it('should present the dimensions in a stable order whatever order the server sent', () => {
    const shuffled = [dimension('reveal', 'strong'), dimension('coverage', 'strong'), dimension('integrity', 'strong')];
    expect(orderedDimensions(report(shuffled)).map(entry => entry.dimension)).toEqual(['coverage', 'integrity', 'reveal']);
  });
});

describe('readinessHeadline', () => {
  it('should say plainly that a complete bible is ready', () => {
    expect(readinessHeadline(report(allStrong))).toBe('This bible is ready to draft from');
  });

  it('should count the blocking gaps when the bible is not ready', () => {
    const dimensions = [dimension('coverage', 'thin', ['power/system-and-limits is missing']), dimension('records', 'empty', ['project/cast needs 3'])];
    const headline = readinessHeadline(report(dimensions, ['power/system-and-limits is missing', 'project/cast needs 3']));
    expect(headline).toBe('Not ready to draft — 2 gaps to close first');
  });

  it('should use the singular for a single blocking gap', () => {
    expect(readinessHeadline(report([dimension('records', 'empty')], ['one gap']))).toBe('Not ready to draft — 1 gap to close first');
  });

  it('should still flag advisory work on a bible that can be drafted', () => {
    const dimensions = [...DIMENSION_ORDER.filter(name => name !== 'reveal').map(name => dimension(name, 'strong')), dimension('reveal', 'empty', ['no canon facts'])];
    expect(readinessHeadline(report(dimensions))).toBe('Ready to draft, with 1 thing worth tightening');
  });
});

describe('readinessIntent', () => {
  it('should be danger while the bible cannot be drafted from', () => {
    expect(readinessIntent(report([dimension('records', 'empty')], ['a gap']))).toBe('danger');
  });

  it('should be success only when every dimension is strong', () => {
    expect(readinessIntent(report(allStrong))).toBe('success');
  });

  it('should be warning when it is draftable but something is thin', () => {
    const dimensions = [...DIMENSION_ORDER.filter(name => name !== 'substance').map(name => dimension(name, 'strong')), dimension('substance', 'thin', ['thin doc'])];
    expect(readinessIntent(report(dimensions))).toBe('warning');
  });
});

describe('advisoryGaps', () => {
  it('should collect the non-blocking gaps and leave the blocking ones to the headline list', () => {
    const dimensions = [dimension('coverage', 'thin', ['coverage gap']), dimension('substance', 'thin', ['substance gap']), dimension('reveal', 'empty', ['reveal gap'])];
    expect(advisoryGaps(report(dimensions, ['coverage gap']))).toEqual(['substance gap', 'reveal gap']);
  });
});

describe('dimension copy', () => {
  it('should label and explain every dimension the server can return', () => {
    for (const name of DIMENSION_ORDER) {
      expect(DIMENSION_LABEL[name]).toBeTruthy();
      expect(DIMENSION_HINT[name]).toBeTruthy();
    }
  });

  it('should tell the author that this screen reads records, which is what made the gap invisible', () => {
    expect(DIMENSION_HINT.records).toContain('records');
  });
});
