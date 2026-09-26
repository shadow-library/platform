import { describe, expect, it } from 'bun:test';

import { linkedByOtherSteps, removedContentOps } from '@modules/notes/content-keys';

import { ledgerEntry } from '../ledger/ledger-fixtures';

describe('linkedByOtherSteps', () => {
  it('should gather the records other passes’ active decisions link, never the asking pass’s own nor a direction’s', () => {
    const ledger = [
      ledgerEntry({ kind: 'decision', stepKey: 'protagonist', links: { entityKeys: ['arden'] } }),
      ledgerEntry({ kind: 'decision', stepKey: 'cast', links: { entityKeys: ['wren'] } }),
      ledgerEntry({ kind: 'direction', stepKey: 'places', links: { entityKeys: ['harbour'] } }),
    ];

    expect([...linkedByOtherSteps(ledger, 'cast')]).toEqual(['arden']);
  });
});

describe('removedContentOps', () => {
  it('should keep a record another pass links while still removing a fact that shares its key', () => {
    const previous = { entityKeys: ['cost_of_power', 'tide_rule'], factKeys: ['cost_of_power'] };

    expect(removedContentOps(previous, {}, new Set(), new Set(['cost_of_power']))).toEqual([
      { op: 'entity.remove', entityKey: 'tide_rule' },
      { op: 'fact.remove', factKey: 'cost_of_power' },
    ]);
  });
});
