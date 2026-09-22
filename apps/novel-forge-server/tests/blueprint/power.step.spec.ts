import { describe, expect, it } from 'bun:test';

import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type PowerSliceOptions } from '@modules/blueprint/steps/engine.step';
import { type PowerSelection, powerStep } from '@modules/blueprint/steps/power.step';
import { OPEN_FROM_CHAPTER } from '@server/common';
import { type Ledger } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

const view: PowerSliceOptions = {
  rungs: [
    { id: 'rg1', name: 'Taper', buys: 'One room of light', cost: 'An hour' },
    { id: 'rg2', name: 'Beacon', buys: 'A harbour of light', cost: 'A day' },
  ],
  note: 'Arden opens at Taper',
};

function selection(overrides: Partial<PowerSelection> = {}): PowerSelection {
  return {
    rungs: [
      { optionId: 'rg1', name: 'Taper', buys: 'One room of light', cost: 'An hour' },
      { optionId: 'rg2', name: 'Beacon', buys: 'A harbour of light', cost: 'A day' },
    ],
    note: 'Arden opens at Taper',
    writerLine: 'Every rung is paid for on the page.',
    ...overrides,
  };
}

function materialise(chosen: PowerSelection, ledger: Ledger.Entry[] = [], page: string | null = null) {
  const context = { round: { round: 1, options: view }, ledger, project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<PowerSliceOptions | null>;
  return powerStep.materialise(chosen, context);
}

const promise = (drivers: string[]): Ledger.Entry => ledgerEntry({ kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', payload: { drivers } });

describe('powerStep.materialise', () => {
  it('should write the ladder as one decision, a rung each as a power rule, and a fact per rung', async () => {
    const plan = await materialise(selection());

    expect(plan.entries[0]).toMatchObject({ kind: 'decision', topic: 'world.power', statement: 'Taper → Beacon', writerLine: 'Every rung is paid for on the page.' });
    expect(plan.changeSet?.filter(op => op.op === 'entity.upsert').map(op => op.entityKey)).toEqual(['rank_taper', 'rank_beacon']);
    expect(plan.changeSet).toContainEqual({
      op: 'fact.upsert',
      factKey: 'rank_taper',
      body: 'Taper buys One room of light, and costs An hour.',
      subjects: ['rank_taper'],
      revealChapter: OPEN_FROM_CHAPTER,
    });
    expect(plan.entries[0]?.links).toMatchObject({ entityKeys: ['rank_taper', 'rank_beacon'], factKeys: ['rank_taper', 'rank_beacon'] });
  });

  it('should merge the ladder into the page the cost rule shares, keeping the cost section', async () => {
    const plan = await materialise(selection(), [], '# Power and its cost\n\n## The cost of power\n\nEvery lit hour costs a named memory');
    const body = (plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { body: string }).body;

    expect(body).toContain('## The cost of power');
    expect(body).toContain('| Taper | One room of light | An hour |');
    expect(body).toContain('*Arden opens at Taper*');
  });

  it('should re-lock the same ladder without removing or duplicating its facts', async () => {
    const first = await materialise(selection());
    const links = first.entries[0]?.links ?? {};
    const locked = ledgerEntry({ kind: 'decision', phase: 'world', topic: 'world.power', stepKey: 'power', links });
    const second = await materialise(selection(), [locked]);

    expect(second.changeSet).toEqual(first.changeSet!);
  });

  it('should retire the records of a rung the author dropped', async () => {
    const locked = ledgerEntry({
      kind: 'decision',
      phase: 'world',
      topic: 'world.power',
      stepKey: 'power',
      links: { entityKeys: ['rank_taper', 'rank_beacon'], factKeys: ['rank_beacon'] },
    });
    const plan = await materialise(
      selection({
        rungs: [
          { name: 'Taper', buys: 'One room of light', cost: 'An hour' },
          { name: 'Watchfire', buys: 'A coast of light', cost: 'A person you loved' },
        ],
      }),
      [locked],
    );

    expect(plan.changeSet).toContainEqual({ op: 'entity.remove', entityKey: 'rank_beacon' });
    expect(plan.changeSet).toContainEqual({ op: 'fact.remove', factKey: 'rank_beacon' });
    expect(plan.changeSet?.some(op => op.op === 'entity.remove' && op.entityKey === 'rank_taper')).toBe(false);
  });

  it('should refuse a rung missing its cost, two rungs of one name and a missing writer line', async () => {
    await expect(
      materialise(
        selection({
          rungs: [
            { name: 'Taper', buys: 'Light', cost: ' ' },
            { name: 'Beacon', buys: 'More light', cost: 'A day' },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'BPR_004',
    });
    await expect(
      materialise(
        selection({
          rungs: [
            { name: 'Taper', buys: 'Light', cost: 'An hour' },
            { name: 'taper', buys: 'More light', cost: 'A day' },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'BPR_004',
    });
    await expect(materialise(selection({ writerLine: ' ' }))).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('powerStep', () => {
  it('should be asked for only when progression drives the novel', () => {
    expect(powerStep.appliesWhen?.([promise(['progression'])])).toBe(true);
    expect(powerStep.appliesWhen?.([promise(['slice_of_life'])])).toBe(false);
    expect(powerStep.appliesWhen?.([])).toBe(false);
  });

  it('should offer the rungs as its options', () => {
    expect(powerStep.describeView(view)).toEqual([
      { id: 'rg1', label: 'Taper — One room of light' },
      { id: 'rg2', label: 'Beacon — A harbour of light' },
    ]);
    expect(powerStep.chosenOptionIds(selection())).toEqual(['rg1', 'rg2']);
  });
});
