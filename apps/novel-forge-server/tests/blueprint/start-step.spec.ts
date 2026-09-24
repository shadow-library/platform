import { describe, expect, it } from 'bun:test';

import { AUTHOR_TIMELINE_TOPIC } from '@modules/ai/context/ledger-sections';
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { type BlueprintStartOutput, BlueprintStartSchema } from '@modules/ai/schemas/blueprint-start.schema';
import { parseSchema } from '@modules/ai/schemas/validate';
import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { isStepDone } from '@modules/blueprint/stage/blueprint-stage';
import { StartInput, StartOptions, StartSelection, startStep } from '@modules/blueprint/steps/start.step';
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

  it('should parse a "later" chip, however the author phrased it, with no required prefix', () => {
    expect(parseSchema(BlueprintStartSchema, { understood: [{ label: 'The debt is finally paid', kind: 'later' }], coachMessage: 'Noted for later.' }).success).toBe(true);
  });
});

describe('start step', () => {
  it('should turn the read-back into chips with ids the author can address', () => {
    const round = startStep.toRound(modelOutput, { previous: null, input: null, focus: null, ledger: [] });
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
    expect(plan.replaces).toEqual(['start', 'start.later', 'start.brief']);
    expect(plan.retires).toEqual(['c1', 'c3']);
    expect(plan.relockKinds).toEqual(['backlog']);
  });

  it('should retire every chip the round offered, so one the author deleted outright goes too', async () => {
    const offered = startStep.toRound(modelOutput, { previous: null, input: null, focus: null, ledger: [] }).options;
    const selection = { chips: [{ optionId: 'c1', label: 'A ferry that only runs at night', kind: 'element' as const }] };
    const plan = await startStep.materialise(selection, { round: { round: 1, options: offered, input: null }, ledger: [], project: {} as Project.Row, tx: {} as never });
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

  it("should keep the author's whole starting text as the brief, beside the chips it was read into", async () => {
    const text = `A tide clock stops the night the town forgets its drowned. ${'The keeper remembers every name. '.repeat(200)}`;
    const offered = startStep.toRound(modelOutput, { previous: null, input: null, focus: null, ledger: [] }).options;
    const selection = { chips: [{ optionId: 'c1', label: 'A ferry that only runs at night', kind: 'element' as const }] };
    const plan = await startStep.materialise(selection, {
      round: { round: 2, options: offered, input: { text: `  ${text}  ` } },
      ledger: [],
      project: {} as Project.Row,
      tx: {} as never,
    });

    expect(plan.entries).toContainEqual({ kind: 'direction', topic: 'start.brief', statement: text.trim() });
    expect(plan.replaces).toContain('start.brief');
  });

  it('should write no brief when the round had no text, while still retiring an earlier one', async () => {
    const selection = { chips: [{ label: 'Found family', kind: 'want' as const }] };
    const plan = await startStep.materialise(selection, {
      round: { round: 1, options: { understood: [] }, input: { startingType: 'nothing' } },
      ledger: [],
      project: {} as Project.Row,
      tx: {} as never,
    });

    expect(plan.entries.some(entry => entry.topic === 'start.brief')).toBe(false);
    expect(plan.replaces).toContain('start.brief');
  });

  it('should take a starting text of up to 10,000 words and refuse a longer one', () => {
    const words = (count: number): string => Array.from({ length: count }, () => 'tide').join(' \n');
    expect(() => startStep.assertInput?.({ text: words(10_000) })).not.toThrow();
    expect(() => startStep.assertInput?.({ text: words(10_001) })).toThrow('the starting text is 10001 words; the limit is 10000');
    expect(() => startStep.assertInput?.({ startingType: 'nothing' })).not.toThrow();
  });

  it('should refuse a text past the character ceiling however few words it holds', () => {
    expect(parseSchema(StartInput, { text: 'a'.repeat(100_000) }).success).toBe(true);
    expect(parseSchema(StartInput, { text: 'a'.repeat(100_001) }).success).toBe(false);
  });

  it('should refuse a lock with no chips', () => {
    expect(parseSchema(StartSelection, { chips: [] }).success).toBe(false);
  });
});

describe('start step — later chips', () => {
  it('should lock a "later" chip as backlog on its own topic, and ask to reconcile it like a direction', async () => {
    const selection = {
      chips: [
        { optionId: 'c1', label: 'Ending: the debt is finally paid', kind: 'later' as const },
        { label: 'Found family', kind: 'want' as const },
      ],
    };
    const plan = await startStep.materialise(selection, { round: null, ledger: [], project: {} as Project.Row, tx: {} as never });
    expect(plan.entries).toContainEqual({
      kind: 'backlog',
      topic: AUTHOR_TIMELINE_TOPIC,
      statement: 'Ending: the debt is finally paid',
      payload: { kind: 'later', optionId: 'c1' },
    });
    expect(plan.replaces).toContain(AUTHOR_TIMELINE_TOPIC);
    expect(plan.relockKinds).toEqual(['backlog']);
  });

  it('should retire a later chip the author dropped, and pair — never duplicate — one they kept unchanged', async () => {
    const kept = ledgerEntry({
      id: 40n,
      kind: 'backlog',
      topic: AUTHOR_TIMELINE_TOPIC,
      stepKey: 'start',
      statement: 'Ending: the debt is finally paid',
      payload: { kind: 'later', optionId: 'c1' },
    });
    const dropped = ledgerEntry({
      id: 41n,
      kind: 'backlog',
      topic: AUTHOR_TIMELINE_TOPIC,
      stepKey: 'start',
      statement: 'Later: the war reaches the capital',
      payload: { kind: 'later', optionId: 'c2' },
    });
    const offered = {
      understood: [
        { id: 'c1', label: 'Ending: the debt is finally paid', kind: 'later' as const },
        { id: 'c2', label: 'Later: the war reaches the capital', kind: 'later' as const },
      ],
    };
    const selection = { chips: [{ optionId: 'c1', label: 'Ending: the debt is finally paid', kind: 'later' as const }] };
    const plan = await startStep.materialise(selection, {
      round: { round: 2, options: offered, input: null },
      ledger: [kept, dropped],
      project: {} as Project.Row,
      tx: {} as never,
    });

    const reconciled = reconcileLockEntries(startStep, plan, [kept, dropped]);
    expect(reconciled.supersede.map(pair => pair.previous.id)).toEqual([40n]);
    expect(reconciled.withdraw.map(entry => entry.id)).toEqual([41n]);
    expect(reconciled.append).toEqual([]);
  });

  it('should move a chip from backlog to a rejection when the author re-kinds it "not", retiring the old backlog entry', async () => {
    const earlier = ledgerEntry({
      id: 42n,
      kind: 'backlog',
      topic: AUTHOR_TIMELINE_TOPIC,
      stepKey: 'start',
      statement: 'Later: the war reaches the capital',
      payload: { kind: 'later', optionId: 'c1' },
    });
    const offered = { understood: [{ id: 'c1', label: 'Later: the war reaches the capital', kind: 'later' as const }] };
    const selection = { chips: [{ optionId: 'c1', label: 'No war at all', kind: 'not' as const }] };
    const plan = await startStep.materialise(selection, { round: { round: 2, options: offered, input: null }, ledger: [earlier], project: {} as Project.Row, tx: {} as never });

    const reconciled = reconcileLockEntries(startStep, plan, [earlier]);
    expect(reconciled.withdraw.map(entry => entry.id)).toEqual([42n]);
    expect(reconciled.append).toContainEqual(
      expect.objectContaining({ kind: 'rejected', topic: 'start.ruled_out', statement: 'No war at all', payload: { kind: 'not', optionId: 'c1' } }),
    );
  });

  it('should count the step done when the only chip the author locked is a later one', async () => {
    const selection = { chips: [{ label: 'Ending: the debt is finally paid', kind: 'later' as const }] };
    const plan = await startStep.materialise(selection, { round: null, ledger: [], project: {} as Project.Row, tx: {} as never });
    const written = plan.entries.map(entry => ledgerEntry({ ...entry, stepKey: 'start' }));
    expect(isStepDone(startStep, written)).toBe(true);
  });

  it('should pair an author-typed later chip (no optionId) by statement on re-lock, writing no duplicate', async () => {
    const typed = ledgerEntry({
      id: 43n,
      kind: 'backlog',
      topic: AUTHOR_TIMELINE_TOPIC,
      stepKey: 'start',
      statement: 'Ending: the last ledger is burned on the steps',
      payload: { kind: 'later' },
    });
    const selection = { chips: [{ label: 'Ending: the last ledger is burned on the steps', kind: 'later' as const }] };
    const plan = await startStep.materialise(selection, { round: null, ledger: [typed], project: {} as Project.Row, tx: {} as never });

    const reconciled = reconcileLockEntries(startStep, plan, [typed]);
    expect(reconciled.supersede.map(pair => [pair.previous.id, pair.next.statement])).toEqual([[43n, 'Ending: the last ledger is burned on the steps']]);
    expect(reconciled.append).toEqual([]);
    expect(reconciled.withdraw).toEqual([]);
  });

  it('should leave every other step’s backlog behaviour exactly as it was: untouched by a re-lock with no opt-in', () => {
    const otherStepsBacklog = ledgerEntry({ id: 50n, kind: 'backlog', topic: 'world.rules', stepKey: 'world_rules' });
    const result = reconcileLockEntries(
      { key: 'world_rules', phase: 'world', completionTopics: ['world.rules'] },
      { entries: [{ kind: 'decision', topic: 'world.rules', statement: 'Crossings cost memories' }], replaces: ['world.rules'] },
      [otherStepsBacklog],
    );
    expect(result.withdraw).toEqual([]);
    expect(result.append).toEqual([{ kind: 'decision', topic: 'world.rules', statement: 'Crossings cost memories', phase: 'world', decidedBy: 'author', stepKey: 'world_rules' }]);
  });
});
