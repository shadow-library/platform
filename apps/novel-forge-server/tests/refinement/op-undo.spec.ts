import { describe, expect, it } from 'bun:test';

import { type ChangeOp } from '@modules/refinement/change-set';
import { AppliedOpGraph } from '@modules/refinement/op-undo';

const OPS: ChangeOp[] = [
  { op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara' },
  { op: 'fact.upsert', factKey: 'mara-debt', body: 'Mara owes the guild.', subjects: ['mara'] },
  { op: 'entity.upsert', entityKey: 'ada', type: 'character', notes: 'Ada keeps the slip.' },
  { op: 'entity.upsert', entityKey: 'ada', type: 'character', status: 'hiding' },
  { op: 'milestone.upsert', milestoneKey: 'mara-leaves', label: 'Mara leaves', subjectEntityKey: 'mara' },
];
const ALL = [0, 1, 2, 3, 4];

function graph(): AppliedOpGraph {
  return new AppliedOpGraph(OPS, new Set(['entity:ada']), ALL);
}

describe('AppliedOpGraph', () => {
  it('should list every applied change naming a record the undone change created, latest first', () => {
    expect(graph().dependents(0, ALL)).toEqual([4, 1]);
  });

  it('should list a later change to the same record as a dependent of an earlier one', () => {
    expect(graph().dependents(2, ALL)).toEqual([3]);
    expect(graph().dependents(3, ALL)).toEqual([]);
  });

  it('should list no dependents for a change nothing else relies on', () => {
    expect(graph().dependents(1, ALL)).toEqual([]);
  });

  it('should ignore dependents already undone', () => {
    expect(graph().dependents(0, [0, 2, 3])).toEqual([]);
  });

  it('should need back what a change relies on, and an earlier change to its record, before redoing it', () => {
    expect(graph().prerequisites(4, [0, 4], [1, 2, 3])).toEqual([0]);
    expect(graph().prerequisites(3, [2, 3], [0, 1, 4])).toEqual([2]);
    expect(graph().prerequisites(2, [2, 3], [0, 1, 4])).toEqual([]);
  });
});
