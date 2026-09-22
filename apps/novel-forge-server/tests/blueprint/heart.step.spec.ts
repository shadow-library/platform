import { describe, expect, it } from 'bun:test';

import { type BlueprintHeartOutput } from '@modules/ai/schemas/blueprint-heart.schema';
import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type HeartOptions, type HeartSelection, heartStep } from '@modules/blueprint/steps/heart.step';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

function output(overrides: Partial<BlueprintHeartOutput> = {}): BlueprintHeartOutput {
  return {
    themes: [
      { text: 'If memories can be sold, what makes you you?', why: 'From the cost rule in the premise.', writerLine: 'Every scene weighs what a memory was worth.' },
      { text: 'What do we owe the people who made us?', why: 'From the direction you kept about debt.', writerLine: 'Debts are people, not numbers.' },
      {
        text: 'Power always costs someone else.',
        why: 'From the concept you kept.',
        caution: 'This is a claim, not a question — it leaves nothing to argue with.',
        writerLine: 'Name the person who paid.',
      },
    ],
    endings: [
      { text: 'Will Kaen recover his past, or choose who he became without it?', why: 'From the premise’s hook.', writerLine: 'Chapter one shows both selves.' },
      { text: 'Can the tithe end without drowning the city?', why: 'From the world rule.', writerLine: 'The city is always in frame.' },
      {
        text: 'Who sold his childhood, and why?',
        why: 'From the premise’s hook.',
        caution: 'This is a mystery that gets solved rather than a question that ends a novel — it makes a better volume 1 hook.',
        writerLine: 'Plant the manifest early.',
      },
    ],
    coachMessage: 'The third ending is a volume 1 hook, not an ending.',
    ...overrides,
  };
}

function options(): HeartOptions {
  return heartStep.toRound(output(), { previous: null, input: null, focus: null }).options;
}

function materialise(selection: HeartSelection, round: HeartOptions | null = options(), page: string | null = null): ReturnType<typeof heartStep.materialise> {
  const ctx = { round: round ? { round: 1, options: round } : null, ledger: [], project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<HeartOptions>;
  return heartStep.materialise(selection, ctx);
}

const THEME = 'If memories can be sold, what makes you you?';
const ENDING = 'Will Kaen recover his past, or choose who he became without it?';

function chosen(overrides: Partial<HeartSelection> = {}): HeartSelection {
  return {
    theme: { optionId: 't1', text: THEME, writerLine: 'Every scene weighs what a memory was worth.' },
    ending: { optionId: 'e1', text: ENDING, writerLine: 'Chapter one shows both selves.' },
    ...overrides,
  };
}

describe('heartStep.toRound', () => {
  it('should number themes and endings apart so one round has no two options with one id', () => {
    const round = options();
    expect(round.themes.map(theme => theme.id)).toEqual(['t1', 't2', 't3']);
    expect(round.endings.map(ending => ending.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('should keep the coach’s caution on the option it belongs to and nowhere else', () => {
    const round = options();
    expect(round.endings[2]?.caution).toContain('volume 1 hook');
    expect(round.endings[0]?.caution).toBeUndefined();
    expect(round.themes[2]?.caution).toContain('not a question');
  });
});

describe('heartStep.describeOptions', () => {
  it('should offer every theme and every ending question', () => {
    expect(heartStep.describeOptions(options())).toHaveLength(6);
    expect(heartStep.describeOptions(options())[3]).toEqual({ id: 'e1', label: ENDING });
  });
});

describe('heartStep.chosenOptionIds', () => {
  it('should name only the answers that came from an option', () => {
    expect(heartStep.chosenOptionIds(chosen())).toEqual(['t1', 'e1']);
    expect(heartStep.chosenOptionIds(chosen({ theme: { text: 'Mine.', writerLine: 'Mine.' } }))).toEqual(['e1']);
  });
});

describe('heartStep.materialise', () => {
  it('should write one decision for the theme and one for the ending question', async () => {
    const plan = await materialise(chosen());
    expect(plan.entries.map(entry => entry.topic)).toEqual(['theme', 'ending']);
    expect(plan.entries[0]).toMatchObject({
      kind: 'decision',
      statement: THEME,
      why: 'From the cost rule in the premise.',
      writerLine: 'Every scene weighs what a memory was worth.',
    });
    expect(plan.entries[1]).toMatchObject({ kind: 'decision', statement: ENDING });
  });

  it('should record the options each decision passed over', async () => {
    const plan = await materialise(chosen());
    expect(plan.entries[0]?.rejectedAlternatives).toEqual(['What do we owe the people who made us?', 'Power always costs someone else.']);
    expect(plan.entries[1]?.rejectedAlternatives).not.toContain(ENDING);
  });

  it('should name the question rather than the chosen option in the payload', async () => {
    const plan = await materialise(chosen());
    expect(plan.entries[0]?.payload).toEqual({ choiceId: 't1', ownWords: false });
    expect(plan.entries.every(entry => (entry.payload as { optionId?: string }).optionId === undefined)).toBe(true);
  });

  it('should take the author’s own words and mark them as theirs', async () => {
    const plan = await materialise(chosen({ theme: { text: '  Who owns a life once it is sold?  ', why: 'Mine.', writerLine: '  Mine too.  ' } }));
    expect(plan.entries[0]).toMatchObject({ statement: 'Who owns a life once it is sold?', why: 'Mine.', writerLine: 'Mine too.' });
    expect(plan.entries[0]?.payload).toEqual({ ownWords: true });
  });

  it('should extend the premise page rather than replacing what the premise step wrote', async () => {
    const existing = '# Premise\n\nA clerk audits the dead.\n\n## Why\n\nBecause debt is memory.';
    const plan = await materialise(chosen(), options(), existing);
    const body = (plan.changeSet?.[0] as { body: string }).body;
    expect(body).toContain('A clerk audits the dead.');
    expect(body).toContain('## Why\n\nBecause debt is memory.');
    expect(body).toContain('## Theme');
    expect(body).toContain('## The ending question');
    expect(plan.changeSet).toHaveLength(1);
  });

  it('should link both decisions to the premise page', async () => {
    const plan = await materialise(chosen());
    expect(plan.entries.every(entry => entry.links?.bibleDocuments?.[0]?.slug === 'premise')).toBe(true);
  });

  it('should refuse an answer that says nothing about what it means for the writer', async () => {
    await expect(materialise(chosen({ ending: { optionId: 'e1', text: ENDING, writerLine: '   ' } }))).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should refuse an empty theme', async () => {
    await expect(materialise(chosen({ theme: { text: '  ', writerLine: 'A line.' } }))).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });
});

describe('heartStep re-lock', () => {
  it('should supersede each topic’s own decision rather than crossing them', async () => {
    const plan = await materialise(chosen());
    const active = [
      ledgerEntry({ id: 80n, kind: 'decision', phase: 'heart', topic: 'theme', stepKey: 'heart', statement: 'An earlier theme.', payload: { choiceId: 't2', ownWords: false } }),
      ledgerEntry({ id: 81n, kind: 'decision', phase: 'heart', topic: 'ending', stepKey: 'heart', statement: 'An earlier ending.', payload: { choiceId: 'e3', ownWords: false } }),
    ];
    const reconciled = reconcileLockEntries(heartStep, plan, active);
    expect(reconciled.supersede.map(pair => [pair.previous.id, pair.next.topic])).toEqual([
      [80n, 'theme'],
      [81n, 'ending'],
    ]);
    expect(reconciled.append).toHaveLength(0);
    expect(reconciled.withdraw).toHaveLength(0);
  });
});
