import { describe, expect, it } from 'bun:test';

import { parseBibleSearch } from '../src/lib/bible-search';

describe('parseBibleSearch', () => {
  it('should keep a topic, a view and a selected entry', () => {
    expect(parseBibleSearch({ topic: 'places', entity: 'salt_docks' })).toEqual({ topic: 'places', view: undefined, entity: 'salt_docks', guide: undefined, fact: undefined });
    expect(parseBibleSearch({ view: 'recent', guide: 'world/geography' })).toMatchObject({ view: 'recent', guide: 'world/geography' });
  });

  it('should open Secrets for the old All facts tab and for a bare fact link', () => {
    expect(parseBibleSearch({ view: 'facts', state: 'hidden', fact: 'forged_ledger' })).toMatchObject({ view: 'secrets', fact: 'forged_ledger' });
    expect(parseBibleSearch({ fact: 'forged_ledger' })).toMatchObject({ view: 'secrets', fact: 'forged_ledger' });
  });

  it('should open the topic an old entity-type filter belonged to', () => {
    expect(parseBibleSearch({ type: 'faction', entity: 'house_velan' })).toMatchObject({ topic: 'factions', entity: 'house_velan' });
    expect(parseBibleSearch({ type: 'concept' }).topic).toBeUndefined();
  });

  it('should prefer an explicit topic over an old type', () => {
    expect(parseBibleSearch({ type: 'faction', topic: 'lore' }).topic).toBe('lore');
  });

  it('should drop the old Entities view and anything malformed', () => {
    expect(parseBibleSearch({ view: 'entities', topic: 'everything', guide: 'diary/page', entity: '' })).toEqual({
      topic: undefined,
      view: undefined,
      entity: undefined,
      guide: undefined,
      fact: undefined,
    });
  });
});
