import { describe, expect, it } from 'bun:test';

import { linkedByOtherSteps, removedContentOps } from '@modules/blueprint/steps/content-keys';

import { ledgerEntry } from './blueprint-fixtures';

describe('linkedByOtherSteps', () => {
  it('should gather the records other steps’ active decisions link, never the asking step’s own nor a direction’s', () => {
    const ledger = [
      ledgerEntry({ kind: 'decision', stepKey: 'protagonist', links: { entityKeys: ['arden'] } }),
      ledgerEntry({ kind: 'decision', stepKey: 'cast', links: { entityKeys: ['wren'] } }),
      ledgerEntry({ kind: 'direction', stepKey: 'places', links: { entityKeys: ['harbour'] } }),
    ];

    expect([...linkedByOtherSteps(ledger, 'cast')]).toEqual(['arden']);
  });
});

describe('removedContentOps', () => {
  it('should keep a record another step links while still removing a fact that shares its key', () => {
    const previous = { entityKeys: ['cost_of_power', 'tide_rule'], factKeys: ['cost_of_power'] };

    expect(removedContentOps(previous, {}, new Set(), new Set(['cost_of_power']))).toEqual([
      { op: 'entity.remove', entityKey: 'tide_rule' },
      { op: 'fact.remove', factKey: 'cost_of_power' },
    ]);
  });
});
