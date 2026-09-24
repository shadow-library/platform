import { describe, expect, it } from 'bun:test';

import {
  isOrganiseRecordType,
  isTimelineBand,
  ORGANISE_RECORD_TYPE_WORDS,
  ORGANISE_RECORD_TYPES,
  organiseRecordKey,
  organiseSectionKey,
  organiseTextKey,
  TIMELINE_BAND_LABELS,
  TIMELINE_BANDS,
} from '@shadow-library/sdk';

describe('organise vocabulary', () => {
  it('should label every band and word every record type', () => {
    expect(TIMELINE_BANDS.every(band => TIMELINE_BAND_LABELS[band].length > 0)).toBe(true);
    expect(ORGANISE_RECORD_TYPES.every(type => ORGANISE_RECORD_TYPE_WORDS[type].length > 0)).toBe(true);
    expect(isTimelineBand('later')).toBe(true);
    expect(isTimelineBand('middle')).toBe(false);
    expect(isOrganiseRecordType('location')).toBe(true);
    expect(isOrganiseRecordType('place')).toBe(false);
  });

  it('should name an item by what it says, whatever its spacing or case', () => {
    expect(organiseTextKey('  The Guild\n owns   the mine ')).toBe('the guild owns the mine');
    expect(organiseSectionKey({ section: 'world', slug: 'the-guild' }, ' What It Wants ')).toBe('world/the-guild|what it wants');
    expect(organiseRecordKey({ name: 'Ilse  Marr', type: 'character' })).toBe('ilse marr|character');
  });
});
