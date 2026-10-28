import { describe, expect, it } from 'bun:test';

import { unrestrictedRaiseFor } from '@modules/refinement/apply';
import { type ChangeOp } from '@modules/refinement/change-set';

const RAISE: ChangeOp = { op: 'brief.update', chapter: 3, contentMode: 'unrestricted' };
const RETITLE: ChangeOp = { op: 'brief.update', chapter: 4, title: 'The Slip' };

function harness(changeSet: ChangeOp[], available: boolean) {
  let asked = 0;
  const db = { query: { refinementProposals: { findFirst: async () => ({ changeSet }) } } } as never;
  const catalog = {
    unrestrictedAvailable: async () => {
      asked++;
      return available;
    },
  };
  return { db, catalog, asked: () => asked };
}

describe('unrestrictedRaiseFor', () => {
  it('should allow a raise only when the catalog routes unrestricted writing', async () => {
    const offered = harness([RAISE], true);
    const withheld = harness([RAISE], false);

    expect(await unrestrictedRaiseFor(offered.db, offered.catalog, 7n, 300n)).toBe('allowed');
    expect(await unrestrictedRaiseFor(withheld.db, withheld.catalog, 7n, 300n)).toBe('refused');
  });

  it('should fail closed without asking when no weighed op raises, so a raise added before the lock is refused', async () => {
    const plain = harness([RETITLE], true);
    const unselected = harness([RETITLE, RAISE], true);

    expect(await unrestrictedRaiseFor(plain.db, plain.catalog, 7n, 300n)).toBe('refused');
    expect(await unrestrictedRaiseFor(unselected.db, unselected.catalog, 7n, 300n, [0])).toBe('refused');
    expect(plain.asked() + unselected.asked()).toBe(0);
  });

  it('should weigh only the selected ops and refuse with no catalog to ask', async () => {
    const selected = harness([RETITLE, RAISE], true);

    expect(await unrestrictedRaiseFor(selected.db, selected.catalog, 7n, 300n, [1])).toBe('allowed');
    expect(await unrestrictedRaiseFor(selected.db, undefined, 7n, 300n)).toBe('refused');
  });
});
