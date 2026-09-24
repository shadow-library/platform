import { describe, expect, it } from 'bun:test';

import { blueprintPremisePrompt } from '@modules/ai/prompts/blueprint-premise.prompt';
import { type BlueprintPremiseOutput } from '@modules/ai/schemas/blueprint-premise.schema';
import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type PremiseInput, type PremiseOptions, type PremiseSelection, premiseStep } from '@modules/blueprint/steps/premise.step';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

function output(overrides: Partial<BlueprintPremiseOutput> = {}): BlueprintPremiseOutput {
  return {
    parts: [
      { text: 'In the harbour city of Vell,', kind: 'setting', alternatives: ['On the terraced island of Vell,', 'In the canal quarter of Vell,'] },
      {
        text: 'where every debt is paid in remembered years,',
        kind: 'rule',
        alternatives: ['where every debt is paid in borrowed names,', 'where every debt is paid in years of sleep,'],
      },
      { text: 'a clerk who audits the dead', kind: 'protagonist', alternatives: ['a diver who salvages contracts', 'a courier who carries confessions'] },
      { text: 'finds his own childhood on a manifest.', kind: 'hook', alternatives: ['finds his mother’s name on a manifest.', 'finds a year he never lived on a manifest.'] },
    ],
    why: 'Built from the concept you kept and your direction that power must cost something real.',
    writerLine: 'The mystery is personal from chapter 1: every clue is also about who he was.',
    coachMessage: 'The hook is the part worth arguing with — it decides whose story this is.',
    ...overrides,
  };
}

function options(input: PremiseInput | null = null, previous: PremiseOptions | null = null): PremiseOptions {
  return premiseStep.toRound(output(), { previous, input, focus: null, ledger: [] }).options;
}

function materialise(selection: PremiseSelection, round: PremiseOptions | null = options(), page: string | null = null): ReturnType<typeof premiseStep.materialise> {
  const ctx = { round: round ? { round: 1, options: round } : null, ledger: [], project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<PremiseOptions>;
  return premiseStep.materialise(selection, ctx);
}

const SENTENCE = 'In the harbour city of Vell, where every debt is paid in remembered years, a clerk who audits the dead finds his own childhood on a manifest.';
const WRITER_LINE = 'The mystery is personal from chapter 1: every clue is also about who he was.';

function wholeSentence(overrides: Partial<PremiseSelection> = {}): PremiseSelection {
  return {
    parts: options().parts.map(part => ({ optionId: part.id, text: part.text })),
    sentence: SENTENCE,
    writerLine: WRITER_LINE,
    ...overrides,
  };
}

describe('premiseStep.inputs', () => {
  it("should read the author's own words when they wrote some, and nothing more", async () => {
    const brief = ledgerEntry({ kind: 'direction', topic: 'start.brief', statement: 'A lamplighter keeps the last lit street in a city that has chosen the dark.' });
    expect(await premiseStep.inputs?.({ ledger: [brief] } as never)).toEqual([{ key: 'author_brief', content: brief.statement, required: true }]);
    expect(await premiseStep.inputs?.({ ledger: [] } as never)).toEqual([]);
  });
});

describe('premiseStep.toRound', () => {
  it('should number the parts and their alternatives', () => {
    const round = options();
    expect(round.parts.map(part => part.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(round.parts[0]?.alternatives.map(alternative => alternative.id)).toEqual(['p1_a1', 'p1_a2']);
    expect(round.writerLine).toBe('The mystery is personal from chapter 1: every clue is also about who he was.');
  });

  it('should rework only the opened part and keep the sentence the author has on screen', () => {
    const previous = options();
    const input: PremiseInput = {
      part: 'p3',
      current: [
        { id: 'p1', text: 'In the harbour city of Vell,' },
        { id: 'p2', text: 'where every debt is paid in borrowed names,' },
        { id: 'p3', text: 'a clerk who audits the dead' },
        { id: 'p4', text: 'finds his own childhood on a manifest.' },
      ],
    };
    const reworked = premiseStep.toRound(
      output({
        parts: output().parts.map((part, index) =>
          index === 2 ? { ...part, text: 'ignored', alternatives: ['a tide-warden who logs the drowned', 'a notary of the harbour dead'] } : part,
        ),
        why: 'a different why',
      }),
      { previous, input, focus: null, ledger: [] },
    ).options;

    expect(reworked.parts[1]?.text).toBe('where every debt is paid in borrowed names,');
    expect(reworked.parts[2]?.text).toBe('a clerk who audits the dead');
    expect(reworked.parts[2]?.alternatives).toEqual([
      { id: 'p3_a1', text: 'a tide-warden who logs the drowned' },
      { id: 'p3_a2', text: 'a notary of the harbour dead' },
    ]);
    expect(reworked.parts[0]?.alternatives).toEqual(previous.parts[0]?.alternatives ?? []);
    expect(reworked.why).toBe(previous.why);
  });

  it('should keep every alternative it had when the model answers with a different number of parts', () => {
    const previous = options();
    const input: PremiseInput = { part: 'p3', current: previous.parts.map(part => ({ id: part.id, text: part.text })) };
    const short = output({ parts: output().parts.slice(0, 2) });
    const reworked = premiseStep.toRound(short, { previous, input, focus: null, ledger: [] }).options;
    expect(reworked.parts).toEqual(previous.parts);
  });

  it('should rewrite the whole sentence when no part is opened', () => {
    const previous = options();
    const next = premiseStep.toRound(output({ why: 'a different why' }), { previous, input: { current: [{ id: 'p1', text: 'edited' }] }, focus: null, ledger: [] }).options;
    expect(next.why).toBe('a different why');
    expect(next.parts[0]?.text).toBe('In the harbour city of Vell,');
  });

  it('should number a goal part like any other and let it be reworked on its own', () => {
    const withGoal = output({
      parts: [
        ...output().parts,
        { text: 'until the ledger itself is abolished.', kind: 'goal', alternatives: ['until the debt is paid in full.', 'until no one owes a year again.'] },
      ],
    });
    const round = premiseStep.toRound(withGoal, { previous: null, input: null, focus: null, ledger: [] }).options;
    expect(round.parts[4]).toMatchObject({ id: 'p5', kind: 'goal', text: 'until the ledger itself is abolished.' });

    const previous = round;
    const input: PremiseInput = { part: 'p5', current: previous.parts.map(part => ({ id: part.id, text: part.text })) };
    const reworked = premiseStep.toRound(
      output({
        parts: previous.parts.map((part, index) =>
          index === 4 ? { text: 'ignored', kind: 'goal', alternatives: ['until the city forgives every debt.', 'until the ledger burns.'] } : output().parts[index]!,
        ),
      }),
      { previous, input, focus: null, ledger: [] },
    ).options;
    expect(reworked.parts[4]).toMatchObject({ id: 'p5', kind: 'goal', text: 'until the ledger itself is abolished.' });
    expect(reworked.parts[4]?.alternatives).toEqual([
      { id: 'p5_a1', text: 'until the city forgives every debt.' },
      { id: 'p5_a2', text: 'until the ledger burns.' },
    ]);
  });
});

describe('blueprintPremisePrompt.postValidate', () => {
  it('should refuse more than one part claiming the book’s through-line', () => {
    const issues = blueprintPremisePrompt.postValidate?.(
      output({
        parts: [
          { text: 'a', kind: 'goal', alternatives: ['b', 'c'] },
          { text: 'd', kind: 'goal', alternatives: ['e', 'f'] },
        ],
      }),
    );
    expect(issues?.join(' ')).toContain('through-line');
  });

  it('should let exactly one goal part through', () => {
    const issues = blueprintPremisePrompt.postValidate?.(
      output({ parts: [...output().parts, { text: 'until the ledger itself is abolished.', kind: 'goal', alternatives: ['a', 'b'] }] }),
    );
    expect(issues).toEqual([]);
  });
});

describe('premiseStep.renderInput', () => {
  it('should show the sentence as it stands and name the part being reworked', () => {
    const rendered = premiseStep.renderInput?.({
      part: 'p2',
      current: [
        { id: 'p1', text: 'In Vell,' },
        { id: 'p2', text: 'where debt is paid in years,' },
      ],
    });
    expect(rendered).toContain('In Vell, where debt is paid in years,');
    expect(rendered).toContain('Rework only this part of it: “where debt is paid in years,”');
  });

  it('should say nothing when the author sends nothing', () => {
    expect(premiseStep.renderInput?.({})).toBeNull();
  });
});

describe('premiseStep.describeOptions', () => {
  it('should offer every part and every alternative as a choosable option', () => {
    const described = premiseStep.describeOptions(options());
    expect(described).toHaveLength(12);
    expect(described[1]).toEqual({ id: 'p1_a1', label: 'On the terraced island of Vell,' });
  });
});

describe('premiseStep.materialise', () => {
  it('should lock the sentence as a decision with its why and writer line', async () => {
    const plan = await materialise(wholeSentence());
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      kind: 'decision',
      topic: 'premise',
      statement: SENTENCE,
      why: 'Built from the concept you kept and your direction that power must cost something real.',
      writerLine: WRITER_LINE,
      links: { bibleDocuments: [{ section: 'project', slug: 'premise' }] },
    });
  });

  it('should record every part the author passed over', async () => {
    const plan = await materialise(wholeSentence());
    expect(plan.entries[0]?.rejectedAlternatives).toContain('On the terraced island of Vell,');
    expect(plan.entries[0]?.rejectedAlternatives).not.toContain('a clerk who audits the dead');
  });

  it('should materialise the project premise and its bible page', async () => {
    const plan = await materialise(wholeSentence());
    expect(plan.changeSet?.[0]).toEqual({ op: 'premise.update', premise: SENTENCE });
    expect(plan.changeSet?.[1]).toMatchObject({ op: 'bible_document.upsert', section: 'project', slug: 'premise' });
    const body = (plan.changeSet?.[1] as { body: string }).body;
    expect(body.startsWith('# Premise')).toBe(true);
    expect(body).toContain('## What it means for the writer');
  });

  it('should write no “Where it’s heading” section when the locked sentence has no goal part', async () => {
    const plan = await materialise(wholeSentence());
    const body = (plan.changeSet?.[1] as { body: string }).body;
    expect(body).not.toContain("Where it's heading");
  });

  it('should write and frame a “Where it’s heading” section for the goal part alone', async () => {
    const round = premiseStep.toRound(
      output({
        parts: [
          ...output().parts,
          { text: 'until the ledger itself is abolished.', kind: 'goal', alternatives: ['until the debt is paid in full.', 'until no one owes a year again.'] },
        ],
      }),
      { previous: null, input: null, focus: null, ledger: [] },
    ).options;
    const selection: PremiseSelection = {
      parts: round.parts.map(part => ({ optionId: part.id, text: part.text })),
      sentence: round.parts.map(part => part.text).join(' '),
      writerLine: WRITER_LINE,
    };
    const plan = await materialise(selection, round);
    const body = (plan.changeSet?.[1] as { body: string }).body;
    expect(body).toContain("## Where it's heading");
    expect(body).toContain('No character knows, wants or works toward it');
    expect(body).toContain('until the ledger itself is abolished.');
  });

  it('should resolve the goal part by partId when the author rewrote it in their own words', async () => {
    const round = premiseStep.toRound(
      output({
        parts: [
          ...output().parts,
          { text: 'until the ledger itself is abolished.', kind: 'goal', alternatives: ['until the debt is paid in full.', 'until no one owes a year again.'] },
        ],
      }),
      { previous: null, input: null, focus: null, ledger: [] },
    ).options;
    const goalPart = round.parts.find(part => part.kind === 'goal');
    const selection: PremiseSelection = {
      parts: round.parts.map(part => (part.id === goalPart?.id ? { partId: part.id, text: 'until every ledger in the city is burned.' } : { optionId: part.id, text: part.text })),
      sentence: [...round.parts.slice(0, -1).map(part => part.text), 'until every ledger in the city is burned.'].join(' '),
      writerLine: WRITER_LINE,
    };
    const plan = await materialise(selection, round);
    const body = (plan.changeSet?.[1] as { body: string }).body;
    expect(body).toContain('until every ledger in the city is burned.');
  });

  it('should remove an existing “Where it’s heading” section on a re-lock with no goal part', async () => {
    const existing = [
      '# Premise',
      '',
      'An earlier sentence.',
      '',
      '## Why',
      '',
      'Because.',
      '',
      '## What it means for the writer',
      '',
      'Something.',
      '',
      "## Where it's heading",
      '',
      'Where the book ends up, as the author states it — not the situation chapter one opens in.',
      '',
      'An old stated ending.',
    ].join('\n');
    const plan = await materialise(wholeSentence(), options(), existing);
    const body = (plan.changeSet?.[1] as { body: string }).body;
    expect(body).not.toContain("Where it's heading");
    expect(body).not.toContain('An old stated ending.');
  });

  it('should take the author’s own words over the round’s', async () => {
    const plan = await materialise({
      parts: [{ text: 'A clerk of the harbour dead audits a year he never lived.' }],
      sentence: '  A clerk of the harbour dead audits a year he never lived.  ',
      why: 'Mine, not yours',
      writerLine: '  Chapter one opens on the manifest.  ',
    });
    expect(plan.entries[0]).toMatchObject({
      statement: 'A clerk of the harbour dead audits a year he never lived.',
      why: 'Mine, not yours',
      writerLine: 'Chapter one opens on the manifest.',
    });
  });

  it('should lock a premise written without any round at all', async () => {
    const plan = await materialise({ parts: [{ text: 'A written-from-scratch premise.' }], sentence: 'A written-from-scratch premise.', writerLine: WRITER_LINE }, null);
    expect(plan.entries[0]?.rejectedAlternatives).toEqual([]);
    expect(plan.entries[0]?.why).toBeNull();
  });

  it('should refuse an empty sentence', async () => {
    await expect(materialise(wholeSentence({ sentence: '   ' }))).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should refuse a lock that says nothing about what the premise means for the writer', async () => {
    await expect(materialise(wholeSentence({ writerLine: '   ' }))).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });
});

describe('premiseStep re-lock', () => {
  it('should supersede the premise decision rather than leaving two active', async () => {
    const plan = await materialise(wholeSentence());
    const active = [ledgerEntry({ id: 70n, kind: 'decision', topic: 'premise', stepKey: 'premise', statement: 'An earlier premise.', payload: null })];
    const reconciled = reconcileLockEntries(premiseStep, plan, active);
    expect(reconciled.supersede.map(pair => [pair.previous.id, pair.next.statement])).toEqual([[70n, SENTENCE]]);
    expect(reconciled.append).toHaveLength(0);
    expect(reconciled.withdraw).toHaveLength(0);
  });
});
