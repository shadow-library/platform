import { describe, expect, it } from 'bun:test';

import { type BibleTidyItem } from '../src/lib/apis/api-types.gen';
import { buildTidySelections, groupByDocument, groupCheckState, groupTidyItems, initialTidySelection, seedTidySelection, tidyApplyLabel } from '../src/lib/bible-tidy';

function item(overrides: Partial<BibleTidyItem> & Pick<BibleTidyItem, 'id' | 'kind'>): BibleTidyItem {
  return { section: 'world', slug: 'delta', docTitle: 'Delta', ...overrides };
}

const ITEMS: BibleTidyItem[] = [
  item({ id: 'n1', kind: 'move_ai_notes', text: 'For the AI: keep it short.', targetSlug: 'world-notes' }),
  item({ id: 's1', kind: 'split', entityKey: 'salt_guild', entityName: 'Salt Guild', entityType: 'faction' }),
  item({ id: 'r1', kind: 'remove_empty', section: 'project', slug: 'default', docTitle: 'Default' }),
  item({ id: 's2', kind: 'split', slug: 'places', docTitle: 'Places', entityKey: 'weir', entityName: 'Weir', entityType: 'location' }),
  item({ id: 't1', kind: 'retitle', currentTitle: 'delta', proposedTitle: 'The Delta' }),
];

describe('groupTidyItems', () => {
  it('should order the groups removals, titles, splits, notes and drop empty groups', () => {
    expect(groupTidyItems(ITEMS).map(group => [group.kind, group.items.map(i => i.id)])).toEqual([
      ['remove_empty', ['r1']],
      ['retitle', ['t1']],
      ['split', ['s1', 's2']],
      ['move_ai_notes', ['n1']],
    ]);
    expect(groupTidyItems([ITEMS[0] as BibleTidyItem]).map(group => group.kind)).toEqual(['move_ai_notes']);
  });
});

describe('groupByDocument', () => {
  it('should keep each source page’s splits together in first-seen order', () => {
    const splits = ITEMS.filter(i => i.kind === 'split');
    expect(groupByDocument(splits).map(group => [group.docTitle, group.items.length])).toEqual([
      ['Delta', 1],
      ['Places', 1],
    ]);
  });
});

describe('groupCheckState', () => {
  it('should read all, none or some', () => {
    const splits = ITEMS.filter(i => i.kind === 'split');
    expect(groupCheckState(splits, new Set(['s1', 's2']))).toBe(true);
    expect(groupCheckState(splits, new Set())).toBe(false);
    expect(groupCheckState(splits, new Set(['s1']))).toBe('indeterminate');
  });
});

describe('initialTidySelection', () => {
  it('should choose removals, retitles and note moves, and leave splits for the author to opt into', () => {
    expect([...initialTidySelection(ITEMS)].sort()).toEqual(['n1', 'r1', 't1']);
  });

  it('should never choose an item that only appears after a refetch once the author has a selection', () => {
    const chosen = new Set(['r1']);
    expect(buildTidySelections([...ITEMS, { ...(ITEMS[0] as BibleTidyItem), id: 'n2' }], chosen, {}).map(s => s.id)).toEqual(['r1']);
  });
});

describe('seedTidySelection', () => {
  it('should wait for the first preview, then take its defaults once', () => {
    expect(seedTidySelection(null, undefined)).toBeNull();
    expect([...(seedTidySelection(null, ITEMS) ?? [])].sort()).toEqual(['n1', 'r1', 't1']);
  });

  it('should never tick an item that appears on a later refetch, even before the author has touched anything', () => {
    const first = seedTidySelection(null, ITEMS);
    const refetched = [...ITEMS, { ...(ITEMS[2] as BibleTidyItem), id: 'r2', slug: 'other' }];
    const after = seedTidySelection(first, refetched);
    expect(after).toBe(first);
    expect(after?.has('r2')).toBe(false);
  });
});

describe('buildTidySelections', () => {
  it('should send only the chosen items, with an entity type only where the author changed it', () => {
    const selections = buildTidySelections(ITEMS, new Set(['s1', 'r1', 's2', 't1']), { s1: 'faction', s2: 'concept', t1: 'concept' });
    expect(selections).toEqual([{ id: 's1' }, { id: 'r1' }, { id: 's2', entityType: 'concept' }, { id: 't1' }]);
  });
});

describe('tidyApplyLabel', () => {
  it('should count the changes', () => {
    expect(tidyApplyLabel(0)).toBe('Nothing selected');
    expect(tidyApplyLabel(1)).toBe('Apply 1 change');
    expect(tidyApplyLabel(4)).toBe('Apply 4 changes');
  });
});
