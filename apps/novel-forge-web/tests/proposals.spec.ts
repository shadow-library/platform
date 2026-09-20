import { describe, expect, it } from 'bun:test';

import {
  applyButtonLabel,
  backLabel,
  changeSetCaption,
  countByFilter,
  defaultDeclined,
  filterProposals,
  isGuardedOp,
  isOpenProposal,
  nextAfterDecision,
  opLabel,
  parseProposalFilter,
  type Proposal,
  proposalDisposition,
  proposalIds,
  proposalMeta,
  proposalTitle,
  selectedOpIndexes,
} from '../src/lib/proposals';

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'p1',
    status: 'pending',
    kind: 'chat',
    scopeType: 'project',
    summary: 'Tighten the ledger subplot',
    changeSet: [{ op: 'entity.upsert', entityKey: 'detective_amara' }],
    revertible: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('parseProposalFilter', () => {
  it('should accept only the three known filters', () => {
    expect(parseProposalFilter('open')).toBe('open');
    expect(parseProposalFilter('applied')).toBe('applied');
    expect(parseProposalFilter('all')).toBe('all');
  });

  it('should reject an unknown or absent value rather than guessing', () => {
    expect(parseProposalFilter('pending')).toBeUndefined();
    expect(parseProposalFilter(undefined)).toBeUndefined();
    expect(parseProposalFilter(7)).toBeUndefined();
  });
});

describe('isOpenProposal', () => {
  it('should treat a conflicted proposal as open because it can still be discarded', () => {
    expect(isOpenProposal({ status: 'conflicted' })).toBe(true);
    expect(isOpenProposal({ status: 'pending' })).toBe(true);
  });

  it('should treat every terminal status as settled', () => {
    for (const status of ['applied', 'discarded', 'superseded', 'reverted'] as const) {
      expect(isOpenProposal({ status })).toBe(false);
    }
  });
});

describe('filterProposals', () => {
  const all = [
    proposal({ id: 'a', status: 'pending' }),
    proposal({ id: 'b', status: 'conflicted' }),
    proposal({ id: 'c', status: 'applied' }),
    proposal({ id: 'd', status: 'superseded' }),
  ];

  it('should keep the proposals still owed a decision under the open filter', () => {
    expect(proposalIds(filterProposals(all, 'open'))).toEqual(['a', 'b']);
  });

  it('should keep only applied proposals under the applied filter', () => {
    expect(proposalIds(filterProposals(all, 'applied'))).toEqual(['c']);
  });

  it('should keep every proposal under the all filter', () => {
    expect(proposalIds(filterProposals(all, 'all'))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('countByFilter', () => {
  it('should count each segment, with all as the unfiltered size', () => {
    const counts = countByFilter([{ status: 'pending' }, { status: 'conflicted' }, { status: 'applied' }, { status: 'reverted' }]);
    expect(counts).toEqual({ open: 2, applied: 1, all: 4 });
  });
});

describe('proposalTitle', () => {
  it('should prefer the summary', () => {
    expect(proposalTitle({ summary: '  Rework the finale  ', kind: 'chat', scopeType: 'project' })).toBe('Rework the finale');
  });

  it('should fall back to kind and scope when the summary is blank or absent', () => {
    expect(proposalTitle({ summary: '   ', kind: 'bible_audit', scopeType: 'entity' })).toBe('bible_audit · entity');
    expect(proposalTitle({ kind: 'plugin', scopeType: 'chapter' })).toBe('plugin · chapter');
  });
});

describe('changeSetCaption', () => {
  it('should name the op count and its distinct types', () => {
    expect(changeSetCaption([{ op: 'entity.upsert' }, { op: 'entity.upsert' }, { op: 'fact.add' }])).toBe('3 ops · entity.upsert, fact.add');
  });

  it('should singularise a one-op change-set', () => {
    expect(changeSetCaption([{ op: 'action.finalize' }])).toBe('1 op · action.finalize');
  });

  it('should cap the listed types so a long change-set stays one line', () => {
    expect(changeSetCaption([{ op: 'a' }, { op: 'b' }, { op: 'c' }, { op: 'd' }, { op: 'e' }])).toBe('5 ops · a, b, c +2 more');
  });

  it('should report an empty change-set without a trailing separator', () => {
    expect(changeSetCaption([])).toBe('0 ops');
  });
});

describe('opLabel', () => {
  it('should append the first identifying target it finds', () => {
    expect(opLabel({ op: 'fact.add', factKey: 'ledger_forgery' })).toBe('fact.add · ledger_forgery');
    expect(opLabel({ op: 'chapter.rewrite', chapter: 12 })).toBe('chapter.rewrite · ch 12');
    expect(opLabel({ op: 'bible.upsert', section: 'world', slug: 'the-docks' })).toBe('bible.upsert · world/the-docks');
  });

  it('should return the bare op when nothing identifies a target', () => {
    expect(opLabel({ op: 'action.finalize' })).toBe('action.finalize');
    expect(opLabel({})).toBe('unknown');
  });
});

describe('defaultDeclined', () => {
  it('should pre-decline the one-way-door ops so they never apply by accident', () => {
    const declined = defaultDeclined([{ op: 'entity.upsert' }, { op: 'action.finalize' }, { op: 'action.graduate_seed' }]);
    expect([...declined]).toEqual([1, 2]);
  });

  it('should decline nothing when the change-set holds no guarded op', () => {
    expect(defaultDeclined([{ op: 'entity.upsert' }]).size).toBe(0);
    expect(isGuardedOp({ op: 'entity.upsert' })).toBe(false);
  });
});

describe('selectedOpIndexes', () => {
  it('should return every index the author left ticked', () => {
    expect(selectedOpIndexes(4, new Set([1, 3]))).toEqual([0, 2]);
    expect(selectedOpIndexes(2, new Set())).toEqual([0, 1]);
    expect(selectedOpIndexes(2, new Set([0, 1]))).toEqual([]);
  });
});

describe('applyButtonLabel', () => {
  it('should name the partial count only when something was declined', () => {
    expect(applyButtonLabel(3, 0)).toBe('Apply to canon');
    expect(applyButtonLabel(3, 1)).toBe('Apply 2 selected');
  });
});

describe('proposalDisposition', () => {
  it('should offer a decision on a pending proposal', () => {
    expect(proposalDisposition({ status: 'pending', revertible: false })).toEqual({ kind: 'decide' });
  });

  it('should block a conflicted proposal from applying while still explaining the discard', () => {
    const disposition = proposalDisposition({ status: 'conflicted', revertible: false });
    expect(disposition.kind).toBe('blocked');
  });

  it('should offer a revert only when the applied proposal recorded an inverse', () => {
    expect(proposalDisposition({ status: 'applied', revertible: true }).kind).toBe('revert');
    const settled = proposalDisposition({ status: 'applied', revertible: false });
    expect(settled.kind).toBe('settled');
    expect(settled.kind === 'settled' && settled.note).toContain('cannot be reverted');
  });

  it('should settle every other status with a note naming it', () => {
    const disposition = proposalDisposition({ status: 'superseded', revertible: false });
    expect(disposition.kind === 'settled' && disposition.note).toBe('This proposal is superseded.');
  });
});

describe('nextAfterDecision', () => {
  it('should advance to the next id in the list the author was working through', () => {
    expect(nextAfterDecision(['a', 'b', 'c'], 'b')).toBe('c');
  });

  it('should return nothing at the end of the list, or when the list cannot place the proposal', () => {
    expect(nextAfterDecision(['a', 'b'], 'b')).toBeUndefined();
    expect(nextAfterDecision(['a', 'b'], 'z')).toBeUndefined();
    expect(nextAfterDecision(undefined, 'a')).toBeUndefined();
  });
});

describe('backLabel', () => {
  it('should count the collection once it has resolved', () => {
    expect(backLabel(12)).toBe('All 12 proposals');
    expect(backLabel(undefined)).toBe('Proposals');
  });
});

describe('proposalMeta', () => {
  it('should read as when the proposal was staged', () => {
    expect(proposalMeta({ createdAt: new Date().toISOString() })).toBe('staged just now');
  });

  it('should render nothing for an unparseable timestamp', () => {
    expect(proposalMeta({ createdAt: 'not-a-date' })).toBe('');
  });
});
