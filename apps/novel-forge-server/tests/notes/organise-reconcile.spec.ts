import { describe, expect, it } from 'bun:test';
import { textDigest } from '@shadow-library/sdk';

import { type NewLedgerEntry } from '@modules/ledger/ledger.types';
import { reconcileOrganiseEntries } from '@modules/notes';

import { ledgerEntry } from '../ledger/ledger-fixtures';

type PlannedEntry = Pick<NewLedgerEntry, 'kind' | 'statement'> & Partial<NewLedgerEntry>;

function plan(entries: PlannedEntry[], overrides: { replaces?: string[]; retires?: string[]; withdraws?: bigint[] } = {}) {
  return {
    entries: entries.map((entry): NewLedgerEntry => ({ topic: 'organise.rules', decidedBy: 'author', stepKey: 'organise', ...entry })),
    replaces: overrides.replaces ?? ['organise', 'organise.rules', 'organise.accepted'],
    retires: overrides.retires ?? [],
    withdraws: overrides.withdraws ?? [],
  };
}

const organised = (overrides: Parameters<typeof ledgerEntry>[0] = {}) => ledgerEntry({ topic: 'organise.rules', stepKey: 'organise', ...overrides });

describe('reconcileOrganiseEntries', () => {
  it('should create every entry on a first answer, stamped as organise’s own', () => {
    const result = reconcileOrganiseEntries(plan([{ kind: 'direction', statement: 'Nobody opens a sealed letter', stepKey: null }]), []);

    expect(result.supersede).toEqual([]);
    expect(result.withdraw).toEqual([]);
    expect(result.create).toEqual([{ kind: 'direction', topic: 'organise.rules', statement: 'Nobody opens a sealed letter', decidedBy: 'author', stepKey: 'organise' }]);
  });

  it('should supersede organise’s earlier entries and withdraw the leftovers, leaving what the author wrote and the backlog alone', () => {
    const kept = organised({ id: 1n, statement: 'Letters travel uphill' });
    const dropped = organised({ id: 2n, kind: 'decision', topic: 'organise', statement: 'Organised into 3 pages.' });
    const backlog = organised({ id: 3n, kind: 'backlog' });
    const authored = ledgerEntry({ id: 4n, kind: 'direction', topic: 'organise.rules', statement: 'Keep it under 300 pages' });

    const result = reconcileOrganiseEntries(plan([{ kind: 'direction', statement: 'Letters travel downhill' }]), [kept, dropped, backlog, authored]);

    expect(result.supersede.map(pair => [pair.previous.id, pair.next.statement])).toEqual([[1n, 'Letters travel downhill']]);
    expect(result.create).toEqual([]);
    expect(result.withdraw.map(entry => entry.id)).toEqual([2n]);
  });

  it('should pair an entry with the one for the same question, then the same statement, then in order', () => {
    const first = organised({ id: 1n, statement: 'A ferry town', payload: { optionId: 'rule_a' } });
    const second = organised({ id: 2n, statement: 'Quiet dread', payload: {} });
    const third = organised({ id: 3n, statement: 'Found family', payload: {} });

    const result = reconcileOrganiseEntries(
      plan([
        { kind: 'direction', statement: 'Something new' },
        { kind: 'direction', statement: 'Found family' },
        { kind: 'direction', statement: 'A ferry town at dusk', payload: { optionId: 'rule_a' } },
      ]),
      [first, second, third],
    );

    expect(result.supersede.map(pair => [pair.next.statement, pair.previous.id])).toEqual([
      ['Something new', 2n],
      ['Found family', 3n],
      ['A ferry town at dusk', 1n],
    ]);
  });

  it('should never pair two entries that answer different questions', () => {
    const answered = organised({ id: 1n, statement: 'A ferry town', payload: { optionId: 'rule_a' } });
    const result = reconcileOrganiseEntries(plan([{ kind: 'direction', statement: 'A river town', payload: { optionId: 'rule_b' } }]), [answered]);

    expect(result.supersede).toEqual([]);
    expect(result.create.map(entry => entry.statement)).toEqual(['A river town']);
    expect(result.withdraw.map(entry => entry.id)).toEqual([1n]);
  });

  it('should leave an answered question alone when the new answer says nothing about its topic and kind, unless it retires the question', () => {
    const accepted = organised({ id: 1n, topic: 'organise.accepted', statement: 'The guild began as a union', payload: { optionId: 'suggestion_x' } });
    const next = plan([{ kind: 'decision', topic: 'organise', statement: 'Organised into 2 pages.' }]);

    expect(reconcileOrganiseEntries(next, [accepted]).withdraw).toEqual([]);
    expect(reconcileOrganiseEntries({ ...next, retires: ['suggestion_x'] }, [accepted]).withdraw.map(entry => entry.id)).toEqual([1n]);
  });

  it('should retire only the topics the plan replaces', () => {
    const refusal = organised({ id: 9n, kind: 'rejected', topic: 'organise.ruled_out', statement: 'A talking cat' });
    const result = reconcileOrganiseEntries(plan([{ kind: 'rejected', topic: 'organise.ruled_out', statement: 'A prophecy' }]), [refusal]);

    expect(result.withdraw).toEqual([]);
    expect(result.create.map(entry => entry.statement)).toEqual(['A prophecy']);
  });

  it('should withdraw a named entry of its own outside the replaced topics, and never one another pass wrote', () => {
    const lifted = organised({ id: 20n, kind: 'rejected', topic: 'organise.ruled_out', statement: 'A talking cat' });
    const kept = organised({ id: 21n, kind: 'rejected', topic: 'organise.ruled_out', statement: 'A prophecy' });
    const foreign = ledgerEntry({ id: 22n, kind: 'rejected', topic: 'concepts', statement: 'Slow openings', stepKey: 'chat' });

    const result = reconcileOrganiseEntries(plan([{ kind: 'direction', statement: 'A ferry town' }], { withdraws: [20n, 22n] }), [lifted, kept, foreign]);

    expect(result.withdraw.map(entry => entry.id)).toEqual([20n]);
  });

  it('should withdraw a rule an earlier answer wrote once the author drops it, by its digest id', () => {
    const optionId = `rule_${textDigest('ilse never opens a letter she carries')}`;
    const rule = organised({ id: 30n, statement: 'Ilse never opens a letter she carries', payload: { optionId } });
    const decision = organised({ id: 31n, kind: 'decision', topic: 'organise', statement: 'Organised into 3 pages.' });

    const result = reconcileOrganiseEntries(plan([{ kind: 'decision', topic: 'organise', statement: 'Organised into 2 pages.' }], { retires: [optionId] }), [rule, decision]);

    expect(result.supersede.map(pair => pair.previous.id)).toEqual([31n]);
    expect(result.withdraw.map(entry => entry.id)).toEqual([30n]);
  });
});
