import { describe, expect, it } from 'bun:test';

import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { type BlueprintStartOutput, BlueprintStartSchema } from '@modules/ai/schemas/blueprint-start.schema';
import { parseSchema } from '@modules/ai/schemas/validate';
import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { StartOptions, StartSelection, startStep } from '@modules/blueprint/steps/start.step';
import { type Project } from '@server/database';

import { ledgerEntry } from './blueprint-fixtures';

const modelOutput: BlueprintStartOutput = {
  understood: [
    { label: ' A ferry that only runs at night ', kind: 'element' },
    { label: 'Quiet dread, not gore', kind: 'want' },
    { label: 'No chosen-one prophecy', kind: 'not' },
  ],
  coachMessage: 'You gave me a place and a mood. I was least sure whether the ferryman is the hero.',
};

describe('blueprint-start prompt', () => {
  it('should be registered, versioned and routed through the small-step Blueprint role', () => {
    expect(PROMPT_REGISTRY['blueprint-start']).toBe(startStep.prompt as never);
    expect(startStep.prompt.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(startStep.prompt.role).toBe('blueprint');
  });

  it('should parse a read-back and an empty one', () => {
    expect(parseSchema(BlueprintStartSchema, modelOutput).success).toBe(true);
    expect(parseSchema(BlueprintStartSchema, { understood: [], coachMessage: 'You have not told me anything yet, and that is fine.' }).success).toBe(true);
  });

  it('should refuse a chip of an unknown kind or a missing coach message', () => {
    expect(parseSchema(BlueprintStartSchema, { ...modelOutput, understood: [{ label: 'A ferry', kind: 'theme' }] }).success).toBe(false);
    expect(parseSchema(BlueprintStartSchema, { understood: [] }).success).toBe(false);
  });
});

describe('start step', () => {
  it('should turn the read-back into chips with ids the author can address', () => {
    const round = startStep.toRound(modelOutput, { previous: null, input: null, focus: null });
    expect(round.options.understood).toEqual([
      { id: 'c1', label: 'A ferry that only runs at night', kind: 'element' },
      { id: 'c2', label: 'Quiet dread, not gore', kind: 'want' },
      { id: 'c3', label: 'No chosen-one prophecy', kind: 'not' },
    ]);
    expect(parseSchema(StartOptions, round.options).success).toBe(true);
    expect(startStep.describeOptions(round.options).map(option => option.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('should render an empty starting point plainly', () => {
    expect(startStep.renderInput?.({ startingType: 'nothing' })).toBe('Starting from nothing yet.\n\nThe author wrote nothing.');
  });

  it('should lock kept chips as directions and ruled-out chips as rejections that a later lock cannot retire', async () => {
    const selection = {
      chips: [
        { optionId: 'c1', label: 'A ferry that only runs at dusk', kind: 'element' as const },
        { label: 'Found family', kind: 'want' as const },
        { optionId: 'c3', label: 'No chosen-one prophecy', kind: 'not' as const },
      ],
    };
    expect(parseSchema(StartSelection, selection).success).toBe(true);
    expect(startStep.chosenOptionIds(selection)).toEqual(['c1', 'c3']);

    const plan = await startStep.materialise(selection, { round: null, ledger: [], project: {} as Project.Row, tx: {} as never });
    expect(plan.changeSet).toBeUndefined();
    expect(plan.entries).toEqual([
      { kind: 'direction', topic: 'start', statement: 'A ferry that only runs at dusk', payload: { kind: 'element', optionId: 'c1' } },
      { kind: 'direction', topic: 'start', statement: 'Found family', payload: { kind: 'want' } },
      { kind: 'rejected', topic: 'start.ruled_out', statement: 'No chosen-one prophecy', payload: { kind: 'not', optionId: 'c3' } },
    ]);
    expect(plan.replaces).toEqual(['start']);
    expect(plan.retires).toEqual(['c1', 'c3']);
  });

  it('should retire every chip the round offered, so one the author deleted outright goes too', async () => {
    const offered = startStep.toRound(modelOutput, { previous: null, input: null, focus: null }).options;
    const selection = { chips: [{ optionId: 'c1', label: 'A ferry that only runs at night', kind: 'element' as const }] };
    const plan = await startStep.materialise(selection, { round: { round: 1, options: offered }, ledger: [], project: {} as Project.Row, tx: {} as never });
    expect(plan.retires).toEqual(['c1', 'c2', 'c3']);

    const stale = ledgerEntry({ id: 33n, kind: 'direction', topic: 'start', stepKey: 'start', statement: 'Quiet dread, not gore', payload: { kind: 'want', optionId: 'c2' } });
    expect(reconcileLockEntries(startStep, plan, [stale]).withdraw.map(entry => entry.id)).toEqual([33n]);
  });

  it('should retire the direction an earlier lock wrote for a chip the author has now ruled out', async () => {
    const selection = { chips: [{ optionId: 'c1', label: 'No ferries at all', kind: 'not' as const }] };
    const earlier = ledgerEntry({
      id: 32n,
      kind: 'direction',
      topic: 'start',
      stepKey: 'start',
      statement: 'A ferry that only runs at night',
      payload: { kind: 'element', optionId: 'c1' },
    });
    const plan = await startStep.materialise(selection, { round: null, ledger: [earlier], project: {} as Project.Row, tx: {} as never });
    const reconciled = reconcileLockEntries(startStep, plan, [earlier]);
    expect(reconciled.withdraw.map(entry => entry.id)).toEqual([32n]);
  });

  it('should not write a rejection the ledger already carries', async () => {
    const selection = { chips: [{ label: 'No chosen-one prophecy', kind: 'not' as const }] };
    const already = ledgerEntry({ id: 31n, kind: 'rejected', topic: 'start.ruled_out', statement: 'No chosen-one prophecy' });
    const plan = await startStep.materialise(selection, { round: null, ledger: [already], project: {} as Project.Row, tx: {} as never });
    expect(plan.entries).toEqual([]);
  });

  it('should refuse a lock with no chips', () => {
    expect(parseSchema(StartSelection, { chips: [] }).success).toBe(false);
  });
});
