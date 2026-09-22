import { describe, expect, it } from 'bun:test';

import { type BlueprintPromiseOutput } from '@modules/ai/schemas/blueprint-promise.schema';
import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { promiseDrivers, promiseEffects, promiseLength, promiseTailoringApplies, promiseTone } from '@modules/blueprint/stage/promise-tailoring';
import { PROMISE_DRIVERS } from '@server/common';
import { type PromiseOptions, type PromiseSelection, promiseStep } from '@modules/blueprint/steps/promise.step';
import { type Ledger } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

function output(overrides: Partial<BlueprintPromiseOutput> = {}): BlueprintPromiseOutput {
  return {
    drivers: PROMISE_DRIVERS.map(id => ({ id, fit: `What ${id} would do here.`, ...(id === 'mystery' || id === 'progression' ? { recommended: true } : {}) })),
    lengths: [
      { id: 'short', note: 'One volume, spent fast.' },
      { id: 'medium', note: 'Four volumes, room to escalate.' },
      { id: 'long', note: 'A decade of chapters.' },
    ],
    tones: [
      { label: 'Hopeful but costly', note: 'Something is won and something is paid.' },
      { label: 'Grim', note: 'Every chapter takes more than it gives.' },
      { label: 'Cosy', note: 'The worst thing that happens is survivable.' },
    ],
    promises: ['Every power has a price you feel on the page', 'The past pays off in stages, never all at once', 'Found family is earned slowly'],
    writerLine: 'Never resolve a debt off the page.',
    coachMessage: 'The premise points at mystery and progression.',
    ...overrides,
  };
}

function options(): PromiseOptions {
  return promiseStep.toRound(output(), { previous: null, input: null, focus: null, ledger: [] }).options;
}

function materialise(selection: PromiseSelection, page: string | null = null): ReturnType<typeof promiseStep.materialise> {
  const ctx = { round: { round: 1, options: options() }, ledger: [], project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<PromiseOptions>;
  return promiseStep.materialise(selection, ctx);
}

function selection(overrides: Partial<PromiseSelection> = {}): PromiseSelection {
  return {
    drivers: ['mystery', 'progression'],
    length: 'medium',
    tone: 'Hopeful but costly',
    toneOptionId: 'tn1',
    promises: [
      { optionId: 'pr1', text: 'Every power has a price you feel on the page' },
      { optionId: 'pr2', text: 'The past pays off in stages, never all at once' },
      { text: 'No rescue arrives that the reader has not met' },
    ],
    writerLine: 'Never resolve a debt off the page.',
    ...overrides,
  };
}

describe('promiseStep.toRound', () => {
  it('should offer every driver and every length whatever the model returned', () => {
    const round = promiseStep.toRound(output({ drivers: [{ id: 'mystery', fit: 'A buried manifest.' }], lengths: [{ id: 'short', note: 'One volume.' }] }), {
      previous: null,
      input: null,
      focus: null,
      ledger: [],
    }).options;
    expect(round.drivers.map(driver => driver.id)).toEqual([...PROMISE_DRIVERS]);
    expect(round.lengths.map(length => length.id)).toEqual(['short', 'medium', 'long']);
    expect(round.drivers[0]?.fit).toBe('A buried manifest.');
    expect(round.drivers[1]?.fit).toContain('was not said this round');
  });

  it('should carry the tailoring rules so the screen states the consequences from them', () => {
    const round = options();
    expect(round.tailoring.map(rule => rule.id)).toEqual(['opposition', 'power_ladder', 'reveal_schedule', 'seasons']);
    expect(round.tailoring.find(rule => rule.id === 'opposition')).toMatchObject({ driver: 'slice_of_life', when: 'absent' });
  });

  it('should number the tones and the promises', () => {
    const round = options();
    expect(round.tones.map(tone => tone.id)).toEqual(['tn1', 'tn2', 'tn3']);
    expect(round.promises.map(promise => promise.id)).toEqual(['pr1', 'pr2', 'pr3']);
  });

  it('should carry the coach’s writer line so the screen can offer it rather than discard it', () => {
    expect(options().writerLine).toBe('Never resolve a debt off the page.');
  });
});

describe('promiseStep.chosenOptionIds', () => {
  it('should name the drivers, the length, the tone and every promise it kept', () => {
    expect(promiseStep.chosenOptionIds(selection())).toEqual(['mystery', 'progression', 'medium', 'tn1', 'pr1', 'pr2']);
  });
});

describe('promiseStep.materialise', () => {
  it('should write the tailoring contract every later phase reads', async () => {
    const plan = await materialise(selection());
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]?.payload).toEqual({
      drivers: ['mystery', 'progression'],
      length: 'medium',
      tone: 'Hopeful but costly',
      promises: ['Every power has a price you feel on the page', 'The past pays off in stages, never all at once', 'No rescue arrives that the reader has not met'],
    });
    expect(plan.entries[0]).toMatchObject({ kind: 'decision', topic: 'promise', writerLine: 'Never resolve a debt off the page.' });
  });

  it('should read back as the drivers, length and tone the later phases ask for', async () => {
    const plan = await materialise(selection());
    const active = [ledgerEntry({ kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', payload: plan.entries[0]?.payload }) as Ledger.Entry];
    expect(promiseDrivers(active)).toEqual(['mystery', 'progression']);
    expect(promiseLength(active)).toBe('medium');
    expect(promiseTone(active)).toBe('Hopeful but costly');
    expect(promiseTailoringApplies('power_ladder', active)).toBe(true);
    expect(promiseTailoringApplies('seasons', active)).toBe(false);
    expect(promiseTailoringApplies('opposition', active)).toBe(true);
  });

  it('should say what the promise is in one line', async () => {
    const plan = await materialise(selection());
    expect(plan.entries[0]?.statement).toBe('Mystery and Progression, ~800 chapters, Hopeful but costly');
  });

  it('should materialise the reader-promise page with the promises and what they change', async () => {
    const plan = await materialise(selection());
    const op = plan.changeSet?.[0] as { op: string; slug: string; body: string };
    expect(op).toMatchObject({ op: 'bible_document.upsert', section: 'project', slug: 'reader-promise' });
    expect(op.body).toContain('## Promises to the reader');
    expect(op.body).toContain('- Every power has a price you feel on the page');
    expect(op.body).toContain('World asks for a power ladder');
    expect(op.body).toContain('The Spine schedules the reveals');
    expect(plan.entries[0]?.links?.bibleDocuments?.[0]?.slug).toBe('reader-promise');
  });

  it('should never ask a slice-of-life novel for an antagonist', async () => {
    const plan = await materialise(selection({ drivers: ['slice_of_life'], toneOptionId: undefined, tone: 'Cosy' }));
    const active = [ledgerEntry({ kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', payload: plan.entries[0]?.payload }) as Ledger.Entry];
    expect(promiseTailoringApplies('opposition', active)).toBe(false);
    expect(promiseTailoringApplies('seasons', active)).toBe(true);
    expect((plan.changeSet?.[0] as { body: string }).body).not.toContain('stands in the protagonist');
  });

  it('should write the page from the deduped drivers', async () => {
    const plan = await materialise(selection({ drivers: ['mystery', 'mystery'] }));
    expect(plan.entries[0]?.statement).toBe('Mystery, ~800 chapters, Hopeful but costly');
    expect((plan.changeSet?.[0] as { body: string }).body).toContain('Mystery, ~800 chapters, Hopeful but costly');
  });

  it('should drop a promise repeated word for word', async () => {
    const plan = await materialise(
      selection({
        promises: [
          { optionId: 'pr1', text: 'Every power has a price' },
          { text: 'Every power has a price' },
          { text: 'The past pays off in stages' },
          { text: 'Found family is earned slowly' },
        ],
      }),
    );
    expect((plan.entries[0]?.payload as { promises: string[] }).promises).toEqual(['Every power has a price', 'The past pays off in stages', 'Found family is earned slowly']);
  });

  it('should refuse a driver that is not one', async () => {
    await expect(materialise(selection({ drivers: ['grimdark'] }))).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should refuse a promise with nothing for the writer', async () => {
    await expect(materialise(selection({ writerLine: '  ' }))).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should refuse fewer promises than the reader is owed', async () => {
    await expect(materialise(selection({ promises: [{ text: 'One' }, { text: '  ' }, { text: 'One' }] }))).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });
});

describe('promiseStep re-lock', () => {
  it('should supersede the promise rather than leaving two tailoring contracts active', async () => {
    const plan = await materialise(selection());
    const active = [
      ledgerEntry({
        id: 90n,
        kind: 'decision',
        phase: 'heart',
        topic: 'promise',
        stepKey: 'promise',
        statement: 'Romance, ~200 chapters, Cosy',
        payload: { drivers: ['romance'] },
      }),
    ];
    const reconciled = reconcileLockEntries(promiseStep, plan, active);
    expect(reconciled.supersede).toHaveLength(1);
    expect(reconciled.append).toHaveLength(0);
    expect(reconciled.withdraw).toHaveLength(0);
  });
});

describe('promiseEffects', () => {
  it('should name what the drivers change and nothing they do not', () => {
    expect(promiseEffects(['mystery']).map(rule => rule.id)).toEqual(['opposition', 'reveal_schedule']);
    expect(promiseEffects(['slice_of_life']).map(rule => rule.id)).toEqual(['seasons']);
    expect(promiseEffects([]).map(rule => rule.id)).toEqual(['opposition']);
  });
});
