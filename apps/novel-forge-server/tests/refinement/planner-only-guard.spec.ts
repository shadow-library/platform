import { describe, expect, it } from 'bun:test';

import { chatTurnWarnings, PLANNER_ONLY_WARNING, readsPlannerOnlyPage } from '@modules/refinement/planner-only-guard';

describe('planner-only guard', () => {
  it('should notice a lookup that read the organised timeline or the open questions, and no other page', () => {
    expect(readsPlannerOnlyPage('get_bible_document', { section: 'project', slug: 'timeline' })).toBe(true);
    expect(readsPlannerOnlyPage('get_bible_document', { section: 'project', slug: 'open-questions' })).toBe(true);
    expect(readsPlannerOnlyPage('get_bible_document', { section: 'world', slug: 'timeline' })).toBe(false);
    expect(readsPlannerOnlyPage('get_entity', { section: 'project', slug: 'timeline' })).toBe(false);
    expect(readsPlannerOnlyPage('get_bible_document', null)).toBe(false);
  });

  it('should treat reading the author’s notes as a planner-only read, and a canon-fact lookup as none', () => {
    expect(readsPlannerOnlyPage('get_notes', {})).toBe(true);
    expect(readsPlannerOnlyPage('get_notes', undefined)).toBe(true);
    expect(readsPlannerOnlyPage('get_canon_facts', { keys: ['keeper_bargain'] })).toBe(false);
    expect(PLANNER_ONLY_WARNING).toContain('your notes');
  });

  it('should warn once on a turn that read one, and leave any other turn’s warnings as they are', () => {
    expect(chatTurnWarnings([], true)).toEqual([PLANNER_ONLY_WARNING]);
    expect(chatTurnWarnings(['echo'], true)).toEqual(['echo', PLANNER_ONLY_WARNING]);
    expect(chatTurnWarnings([PLANNER_ONLY_WARNING], true)).toEqual([PLANNER_ONLY_WARNING]);
    expect(chatTurnWarnings(['echo'], false)).toEqual(['echo']);
  });
});
