import { describe, expect, it } from 'bun:test';

import { type SeedFieldsResponse } from '../src/lib/apis/api-types.gen';
import { fieldValue, missingSummary, provenanceText, readinessHeadline, readinessIntent, settledSummary, SHEET_FIELDS, sheetReadiness } from '../src/lib/seed-sheet';

const BLANK: SeedFieldsResponse = {};

function full(): SeedFieldsResponse {
  return Object.fromEntries(SHEET_FIELDS.map(field => [field.key, field.key === 'themes' ? ['grief'] : 'settled'])) as SeedFieldsResponse;
}

describe('fieldValue', () => {
  it('should read a trimmed string', () => {
    expect(fieldValue({ premise: '  A courier who cannot lie.  ' }, 'premise')).toBe('A courier who cannot lie.');
  });

  it('should read whitespace as unset', () => {
    expect(fieldValue({ premise: '   ' }, 'premise')).toBeUndefined();
  });

  it('should read a missing key as unset', () => {
    expect(fieldValue(BLANK, 'premise')).toBeUndefined();
  });

  it('should join a list on the sheet separator', () => {
    expect(fieldValue({ themes: ['grief', 'debt'] }, 'themes')).toBe('grief · debt');
  });

  it('should read an empty list as unset', () => {
    expect(fieldValue({ themes: [] }, 'themes')).toBeUndefined();
  });
});

describe('provenanceText', () => {
  it('should name the author as theirs', () => {
    expect(provenanceText({ source: 'author', turnOrdinal: 2 })).toBe('yours · turn 2');
  });

  it('should name the studio and the crossing', () => {
    expect(provenanceText({ source: 'studio', turnOrdinal: 7 })).toBe('studio · turn 7');
    expect(provenanceText({ source: 'crossed', turnOrdinal: 1 })).toBe('crossed · turn 1');
  });

  it('should drop the turn when no conversational turn settled it', () => {
    expect(provenanceText({ source: 'author', turnOrdinal: null })).toBe('yours');
  });

  it('should keep a zeroth turn rather than reading it as absent', () => {
    expect(provenanceText({ source: 'studio', turnOrdinal: 0 })).toBe('studio · turn 0');
  });
});

describe('sheetReadiness', () => {
  it('should read a seed with nothing on it as blank', () => {
    const readiness = sheetReadiness(BLANK);
    expect(readiness.stage).toBe('blank');
    expect(readiness.settled).toBe(0);
    expect(readiness.total).toBe(SHEET_FIELDS.length);
    expect(readiness.missing).toHaveLength(SHEET_FIELDS.length);
  });

  it('should read one filled field as started', () => {
    const readiness = sheetReadiness({ premise: 'A courier who cannot lie.' });
    expect(readiness.stage).toBe('started');
    expect(readiness.settled).toBe(1);
    expect(readiness.missing).not.toContain('Premise');
  });

  it('should read every field filled as settled', () => {
    const readiness = sheetReadiness(full());
    expect(readiness.stage).toBe('settled');
    expect(readiness.settled).toBe(SHEET_FIELDS.length);
    expect(readiness.missing).toEqual([]);
  });

  it('should list the gaps in sheet order', () => {
    const readiness = sheetReadiness({ workingTitle: 'The Wreck Singer', premise: 'A courier who cannot lie.' });
    expect(readiness.missing.slice(0, 3)).toEqual(['Genre', 'Hook', 'Cast shape']);
  });
});

describe('readinessHeadline', () => {
  it('should say nothing is settled on a blank seed', () => {
    expect(readinessHeadline(sheetReadiness(BLANK))).toBe('Nothing settled yet');
  });

  it('should count the settled fields part way through', () => {
    expect(readinessHeadline(sheetReadiness({ premise: 'p', hook: 'h' }))).toBe(`2 of ${SHEET_FIELDS.length} settled`);
  });

  it('should say so once the sheet is complete', () => {
    expect(readinessHeadline(sheetReadiness(full()))).toBe('Every field settled');
  });
});

describe('readinessIntent', () => {
  it('should escalate from blank to settled', () => {
    expect(readinessIntent(sheetReadiness(BLANK))).toBe('danger');
    expect(readinessIntent(sheetReadiness({ premise: 'p' }))).toBe('warning');
    expect(readinessIntent(sheetReadiness(full()))).toBe('success');
  });
});

describe('settledSummary', () => {
  it('should count even when nothing is settled', () => {
    expect(settledSummary(sheetReadiness(BLANK))).toBe(`0 of ${SHEET_FIELDS.length} settled`);
  });
});

describe('missingSummary', () => {
  it('should say nothing when there is no gap', () => {
    expect(missingSummary([])).toBeUndefined();
  });

  it('should name a single gap', () => {
    expect(missingSummary(['Premise'])).toBe('Premise still to settle.');
  });

  it('should name both of two gaps', () => {
    expect(missingSummary(['Premise', 'Hook'])).toBe('Premise and Hook still to settle.');
  });

  it('should name two and count the rest', () => {
    expect(missingSummary(['Premise', 'Hook', 'Stakes'])).toBe('Premise, Hook and 1 more still to settle.');
    expect(missingSummary(['Premise', 'Hook', 'Stakes', 'Voice', 'Themes'])).toBe('Premise, Hook and 3 more still to settle.');
  });
});
