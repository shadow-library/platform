import { describe, expect, it } from 'bun:test';

import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { TASTE_GAVE_UP_TOPIC, type TasteOptions, type TasteSelection, tasteStep } from '@modules/blueprint/steps/taste.step';
import { type BlueprintTasteOutput } from '@modules/ai/schemas/blueprint-taste.schema';

import { ledgerEntry } from './blueprint-fixtures';

function output(overrides: Partial<BlueprintTasteOutput> = {}): BlueprintTasteOutput {
  return {
    pairs: [
      {
        a: { text: 'She loses the first three trials and learns from each', label: 'slow-burn rise' },
        b: { text: 'She wins the first trial nobody expected her to', label: 'early triumph' },
      },
    ],
    giveUpReasons: ['Protagonist never really loses'],
    coachMessage: 'You keep choosing the harder road, so the next pairs ask what it costs.',
    ...overrides,
  };
}

const context = { previous: null, input: null, focus: null };

function options(): TasteOptions {
  return tasteStep.toRound(output(), context).options;
}

function selection(overrides: Partial<TasteSelection> = {}): TasteSelection {
  return { verdicts: [], ...overrides };
}

function materialise(value: TasteSelection, round: TasteOptions | null, ledger: unknown[] = []): ReturnType<typeof tasteStep.materialise> {
  const ctx = { round: round ? { round: 1, options: round } : null, ledger, project: {}, tx: {} } as unknown as MaterialiseContext<TasteOptions>;
  return tasteStep.materialise(value, ctx);
}

describe('tasteStep.toRound', () => {
  it('should number pairs and reasons from one on a first round', () => {
    const first = options();
    expect(first.pairs).toEqual([
      {
        id: 'p1',
        a: { text: 'She loses the first three trials and learns from each', label: 'slow-burn rise' },
        b: { text: 'She wins the first trial nobody expected her to', label: 'early triumph' },
      },
    ]);
    expect(first.giveUpReasons).toEqual([{ id: 'r1', label: 'Protagonist never really loses' }]);
  });

  it('should add the new pairs to the pairs already asked rather than replacing them', () => {
    const previous = options();
    const next = tasteStep.toRound(
      output({
        pairs: [{ a: { text: 'The mentor is proven right', label: 'mentor matters' }, b: { text: 'The mentor is proven wrong', label: 'mentor fails' } }],
        giveUpReasons: ['Power creep killed the stakes'],
      }),
      { ...context, previous },
    );
    expect(next.options.pairs.map(pair => pair.id)).toEqual(['p1', 'p2']);
    expect(next.options.pairs[1]?.a.label).toBe('mentor matters');
    expect(next.options.giveUpReasons.map(reason => reason.label)).toEqual(['Protagonist never really loses', 'Power creep killed the stakes']);
  });

  it('should drop a pair and a reason it has already asked', () => {
    const previous = options();
    const next = tasteStep.toRound(output({ giveUpReasons: ['  protagonist never really loses  '] }), { ...context, previous });
    expect(next.options.pairs).toHaveLength(1);
    expect(next.options.giveUpReasons).toHaveLength(1);
  });
});

describe('tasteStep.describeOptions', () => {
  it('should name every pair by its two taste labels and every reason by itself', () => {
    expect(tasteStep.describeOptions(options())).toEqual([
      { id: 'p1', label: 'slow-burn rise or early triumph' },
      { id: 'r1', label: 'Protagonist never really loses' },
    ]);
  });
});

describe('tasteStep.inputs', () => {
  it('should tell the model which pairs it has already asked', async () => {
    const sections = await tasteStep.inputs?.({ previous: options() } as never);
    expect(sections?.[0]?.key).toBe('taste_asked');
    expect(sections?.[0]?.content).toContain('never ask any of these again');
    expect(sections?.[0]?.content).toContain('She loses the first three trials and learns from each');
  });

  it('should send nothing on a first round', async () => {
    expect(await tasteStep.inputs?.({ previous: null } as never)).toEqual([]);
  });
});

describe('tasteStep.materialise', () => {
  it('should write the chosen side as a taste direction', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'a' }] }), options());
    expect(plan.entries).toEqual([
      {
        kind: 'direction',
        topic: 'taste',
        statement: 'slow-burn rise',
        why: 'Would rather read “She loses the first three trials and learns from each” than “She wins the first trial nobody expected her to”.',
        payload: { optionId: 'p1', verdict: 'a' },
      },
    ]);
  });

  it('should write both labels as one direction when the author wants both', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'both' }] }), options());
    expect(plan.entries[0]).toMatchObject({ kind: 'direction', statement: 'slow-burn rise and early triumph' });
  });

  it('should reject both sides, as this pair’s answer, when the author would read neither', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'neither' }] }), options());
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries.map(entry => [entry.kind, entry.topic, entry.statement])).toEqual([
      ['rejected', 'taste', 'slow-burn rise'],
      ['rejected', 'taste', 'early triumph'],
    ]);
    expect(plan.replaces).toEqual(['taste']);
    expect(plan.retires).toEqual(['p1']);
  });

  it('should save the author’s own words when the answer depends', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'depends', note: '  Depends on who is watching  ' }] }), options());
    expect(plan.entries[0]).toMatchObject({ kind: 'direction', statement: 'Depends on who is watching', why: 'On “slow-burn rise or early triumph”.' });
  });

  it('should refuse a depends verdict with nothing behind it', async () => {
    await expect(materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'depends' }] }), options())).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should reject the give-up reasons the author picked and the ones they typed', async () => {
    const plan = await materialise(selection({ reasonIds: ['r1', 'r1'], ownReasons: ['  Too many names in chapter one  ', '   '] }), options());
    expect(plan.entries.map(entry => entry.statement)).toEqual(['Protagonist never really loses', 'Too many names in chapter one']);
    expect(plan.entries.every(entry => entry.kind === 'rejected')).toBe(true);
  });

  it('should ignore a verdict on a pair the round never offered', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p9', verdict: 'a' }], reasonIds: ['r1'] }), options());
    expect(plan.entries).toHaveLength(1);
  });

  it('should refuse a lock that answers nothing at all', async () => {
    await expect(materialise(selection(), options())).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should refuse a lock before any pairs have been offered', async () => {
    await expect(materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'a' }] }), null)).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should not write a give-up reason the ledger already carries', async () => {
    const already = ledgerEntry({ id: 90n, kind: 'rejected', topic: TASTE_GAVE_UP_TOPIC, statement: 'Protagonist never really loses' });
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'a' }], reasonIds: ['r1'] }), options(), [already]);
    expect(plan.entries.map(entry => entry.statement)).toEqual(['slow-burn rise']);
  });
});

describe('tasteStep re-lock', () => {
  const active = () => [
    ledgerEntry({ id: 40n, kind: 'direction', topic: 'taste', stepKey: 'taste', statement: 'slow-burn rise', payload: { optionId: 'p1', verdict: 'a' } }),
    ledgerEntry({ id: 41n, kind: 'direction', topic: 'taste', stepKey: 'taste', statement: 'mentor matters', payload: { optionId: 'p2', verdict: 'a' } }),
    ledgerEntry({ id: 42n, kind: 'direction', topic: 'taste', stepKey: null, statement: 'Written by the author', payload: null }),
    ledgerEntry({ id: 43n, kind: 'rejected', topic: TASTE_GAVE_UP_TOPIC, stepKey: 'taste', statement: 'Romance took over', payload: null }),
  ];

  it('should supersede each pair’s earlier answer when the lock carries the whole answer', async () => {
    const round = tasteStep.toRound(
      output({ pairs: [{ a: { text: 'The mentor is proven right', label: 'mentor matters' }, b: { text: 'The mentor is proven wrong', label: 'mentor fails' } }] }),
      { ...context, previous: options() },
    ).options;
    const plan = await materialise(
      selection({
        verdicts: [
          { optionId: 'p1', verdict: 'b' },
          { optionId: 'p2', verdict: 'a' },
        ],
      }),
      round,
    );
    const reconciled = reconcileLockEntries(tasteStep, plan, active());
    expect(reconciled.supersede.map(pair => [pair.previous.id, pair.next.statement])).toEqual([
      [40n, 'early triumph'],
      [41n, 'mentor matters'],
    ]);
    expect(reconciled.append).toHaveLength(0);
    expect(reconciled.withdraw).toHaveLength(0);
  });

  // One lock writes the step's whole answer, so a screen that sends half of it retires the other half. The screen rehydrates
  // its answers from the active ledger before it locks precisely so that this never happens to an author on a revisit.
  it('should retire an answer the lock no longer carries', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'b' }] }), options());
    const reconciled = reconcileLockEntries(tasteStep, plan, active());
    expect(reconciled.supersede.map(pair => pair.previous.id)).toEqual([40n]);
    expect(reconciled.withdraw.map(entry => entry.id)).toEqual([41n]);
  });

  it('should never retire a give-up reason, however the answers change', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'a' }], reasonIds: ['r1'] }), options());
    const reconciled = reconcileLockEntries(tasteStep, plan, active());
    expect(reconciled.withdraw.map(entry => entry.id)).not.toContain(43n);
  });

  it('should retire the direction a pair had when the author answers it with neither', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'neither' }] }), options());
    const reconciled = reconcileLockEntries(tasteStep, plan, active());
    expect(reconciled.withdraw.map(entry => entry.id)).toEqual([40n]);
    expect(reconciled.append.map(entry => entry.statement)).toEqual(['slow-burn rise', 'early triumph']);
  });

  it('should keep a pair answered neither twice answered', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'neither' }] }), options(), [
      ledgerEntry({ id: 50n, kind: 'rejected', topic: 'taste', stepKey: 'taste', statement: 'slow-burn rise', payload: { optionId: 'p1', verdict: 'neither', side: 'a' } }),
      ledgerEntry({ id: 51n, kind: 'rejected', topic: 'taste', stepKey: 'taste', statement: 'early triumph', payload: { optionId: 'p1', verdict: 'neither', side: 'b' } }),
    ]);
    const reconciled = reconcileLockEntries(tasteStep, plan, [
      ledgerEntry({ id: 50n, kind: 'rejected', topic: 'taste', stepKey: 'taste', statement: 'slow-burn rise', payload: { optionId: 'p1', verdict: 'neither', side: 'a' } }),
      ledgerEntry({ id: 51n, kind: 'rejected', topic: 'taste', stepKey: 'taste', statement: 'early triumph', payload: { optionId: 'p1', verdict: 'neither', side: 'b' } }),
    ]);
    expect(reconciled.supersede.map(pair => pair.previous.id)).toEqual([50n, 51n]);
    expect(reconciled.withdraw).toHaveLength(0);
  });

  it('should take both bans down when a pair answered neither is answered again', async () => {
    const plan = await materialise(selection({ verdicts: [{ optionId: 'p1', verdict: 'a' }] }), options());
    const banned = (side: string, statement: string) =>
      ledgerEntry({ id: side === 'a' ? 50n : 51n, kind: 'rejected', topic: 'taste', stepKey: 'taste', statement, payload: { optionId: 'p1', verdict: 'neither', side } });
    const reconciled = reconcileLockEntries(tasteStep, plan, [banned('a', 'slow-burn rise'), banned('b', 'early triumph')]);
    expect(reconciled.withdraw.map(entry => entry.id)).toEqual([50n, 51n]);
    expect(reconciled.append.map(entry => entry.statement)).toEqual(['slow-burn rise']);
  });
});
