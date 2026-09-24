import { describe, expect, it } from 'bun:test';

import { CONCEPTS_CORRECTED_TOPIC, renderLedger } from '@modules/ai/context/ledger-sections';
import { blueprintConceptsPrompt } from '@modules/ai/prompts/blueprint-concepts.prompt';
import { type BlueprintConceptsOutput } from '@modules/ai/schemas/blueprint-concepts.schema';
import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { parseSchema } from '@modules/ai/schemas/validate';
import { ConceptCardOption, CONCEPTS_KILLED_TOPIC, type ConceptsOptions, ConceptsSelection, conceptsStep } from '@modules/blueprint/steps/concepts.step';

import { ledgerEntry } from './blueprint-fixtures';

const CARDS: BlueprintConceptsOutput['cards'] = [
  {
    title: 'The Ledger of Salt',
    logline: 'A harbour clerk who audits the dead finds his own name on a manifest.',
    engine: 'an audit that keeps turning up people',
    hook: 'The dead pay their taxes on time.',
    fromAuthor: true,
  },
  {
    title: 'Ninth Heir',
    logline: 'The succession picked the wrong sibling and nobody may say so.',
    engine: 'a court that must not be contradicted',
    hook: 'Everyone bows to a mistake.',
  },
  {
    title: 'Low Water',
    logline: 'A caravan guard learns the wells are being emptied on purpose.',
    engine: 'a journey against a shrinking supply',
    hook: 'Water is money and neither lasts.',
  },
  {
    title: 'The Quiet Archive',
    logline: 'A librarian wakes in a city where writing has been outlawed.',
    engine: 'hiding what cannot be destroyed',
    hook: 'Someone has to remember.',
  },
];

function output(overrides: Partial<BlueprintConceptsOutput> = {}): BlueprintConceptsOutput {
  return { cards: CARDS, coachMessage: 'Four engines, one of them yours; refuse the ones that bore you.', ...overrides };
}

function options(): ConceptsOptions {
  return conceptsStep.toRound(output(), { previous: null, input: null, focus: null, ledger: [] }).options;
}

function materialise(selection: ConceptsSelection, round: ConceptsOptions | null = options(), ledger: unknown[] = []): ReturnType<typeof conceptsStep.materialise> {
  const ctx = { round: round ? { round: 2, options: round } : null, ledger, project: {}, tx: {} } as unknown as MaterialiseContext<ConceptsOptions>;
  return conceptsStep.materialise(selection, ctx);
}

describe('conceptsStep.toRound', () => {
  it('should number the cards and keep the author’s own card marked', () => {
    const round = options();
    expect(round.cards.map(card => card.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(round.cards[0]?.fromAuthor).toBe(true);
    expect(round.cards[1]).not.toHaveProperty('fromAuthor');
  });
});

describe('conceptsStep.describeOptions', () => {
  it('should name every card by its title and logline', () => {
    expect(conceptsStep.describeOptions(options())[1]).toEqual({ id: 'c2', label: 'Ninth Heir — The succession picked the wrong sibling and nobody may say so.' });
  });
});

describe('conceptsStep.chosenOptionIds', () => {
  it('should address the kept card and every killed one', () => {
    expect(conceptsStep.chosenOptionIds({ kept: { optionId: 'c1' }, killed: [{ optionId: 'c2', reason: 'chosen-one court intrigue' }] })).toEqual(['c1', 'c2']);
  });
});

describe('conceptsStep.materialise', () => {
  it('should keep the chosen card as a direction and kill the rest with their reasons', async () => {
    const plan = await materialise({
      kept: { optionId: 'c1', why: 'It is my idea, sharpened' },
      killed: [
        { optionId: 'c2', reason: 'chosen-one prophecy' },
        { optionId: 'c4', reason: 'too quiet for me' },
      ],
    });
    expect(plan.entries[0]).toEqual({
      kind: 'direction',
      topic: 'concepts',
      statement: 'A harbour clerk who audits the dead finds his own name on a manifest.',
      why: 'It is my idea, sharpened',
      payload: { cardId: 'c1', title: 'The Ledger of Salt', engine: 'an audit that keeps turning up people', hook: 'The dead pay their taxes on time.', fromAuthor: true },
    });
    expect(plan.entries.slice(1).map(entry => [entry.kind, entry.topic, entry.why])).toEqual([
      ['rejected', CONCEPTS_KILLED_TOPIC, 'chosen-one prophecy'],
      ['rejected', CONCEPTS_KILLED_TOPIC, 'too quiet for me'],
    ]);
    expect(plan.replaces).toEqual(['concepts']);
    expect(plan.changeSet).toBeUndefined();
  });

  it('should use the author’s edits over the card’s own words', async () => {
    const plan = await materialise({ kept: { optionId: 'c3', title: 'Dry Season', logline: '  A caravan guard is paid in water she is not allowed to drink.  ' } });
    expect(plan.entries[0]).toMatchObject({
      statement: 'A caravan guard is paid in water she is not allowed to drink.',
      why: 'Kept “Dry Season” — what keeps it going: a journey against a shrinking supply',
    });
  });

  it('should ignore a kill aimed at the card being kept', async () => {
    const plan = await materialise({ kept: { optionId: 'c1' }, killed: [{ optionId: 'c1', reason: 'changed my mind twice' }] });
    expect(plan.entries).toHaveLength(1);
  });

  it('should refuse a kept card the round never offered', async () => {
    await expect(materialise({ kept: { optionId: 'c9' } })).rejects.toThrow(expect.objectContaining({ code: 'BPR_005' }));
  });

  it('should refuse a lock before any cards exist', async () => {
    await expect(materialise({ kept: { optionId: 'c1' } }, null)).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should mark a killed author card as a correction on its own topic, with a plain statement', async () => {
    const plan = await materialise({ kept: { optionId: 'c3' }, killed: [{ optionId: 'c1', reason: 'too grim for me' }] });
    expect(plan.entries[1]).toMatchObject({
      kind: 'rejected',
      topic: CONCEPTS_CORRECTED_TOPIC,
      statement: 'The Ledger of Salt — A harbour clerk who audits the dead finds his own name on a manifest.',
      why: 'too grim for me',
    });
  });

  it('should not write a kill the ledger already carries', async () => {
    const already = ledgerEntry({
      id: 80n,
      kind: 'rejected',
      topic: CONCEPTS_KILLED_TOPIC,
      statement: 'Ninth Heir — The succession picked the wrong sibling and nobody may say so.',
    });
    const plan = await materialise({ kept: { optionId: 'c1' }, killed: [{ optionId: 'c2', reason: 'said it already' }] }, options(), [already]);
    expect(plan.entries).toHaveLength(1);
  });
});

describe('conceptsStep.inputs', () => {
  it('should name the cards on screen so a re-roll cannot offer them again', async () => {
    const sections = await conceptsStep.inputs?.({ previous: options(), ledger: [] } as never);
    expect(sections?.[0]?.key).toBe('already_shown');
    expect(sections?.[0]?.content).toContain('never offer any of these again');
    expect(sections?.[0]?.content).toContain('Ninth Heir — engine: a court that must not be contradicted');
  });

  it('should send nothing on a first round', async () => {
    expect(await conceptsStep.inputs?.({ previous: null, ledger: [] } as never)).toEqual([]);
  });

  it('should leave the author’s own card out of what must never return', async () => {
    const sections = await conceptsStep.inputs?.({ previous: options(), ledger: [] } as never);
    expect(sections?.[0]?.content).not.toContain('The Ledger of Salt');
    expect(sections?.[0]?.content).toContain('Ninth Heir — engine: a court that must not be contradicted');
  });

  it("should put the author's own words ahead of everything else it reads", async () => {
    const brief = ledgerEntry({ kind: 'direction', topic: 'start.brief', statement: 'Two rival cartographers are hired to map the same vanishing island.' });
    const sections = await conceptsStep.inputs?.({ previous: options(), ledger: [brief] } as never);
    expect(sections?.map(section => section.key)).toEqual(['author_brief', 'already_shown']);
    expect(sections?.[0]?.content).toBe(brief.statement);
  });
});

describe('conceptsStep killed cards', () => {
  it('should reach the next round only as something never to propose again', async () => {
    const plan = await materialise({ kept: { optionId: 'c1' }, killed: [{ optionId: 'c2', reason: 'chosen-one prophecy' }] });
    const rendered = renderLedger(plan.entries.map(entry => ledgerEntry({ ...entry, phase: 'idea', decidedBy: 'author' } as never)));
    expect(rendered).toContain('### Do not propose');
    expect(rendered).toContain("Ninth Heir — The succession picked the wrong sibling and nobody may say so. (the author's reason: chosen-one prophecy)");
    expect(rendered.slice(0, rendered.indexOf('### Do not propose'))).not.toContain('Ninth Heir');
  });

  it('should render a killed author card as a correction, never inside “Do not propose”', async () => {
    const plan = await materialise({ kept: { optionId: 'c3' }, killed: [{ optionId: 'c1', reason: 'too grim for me' }] });
    const rendered = renderLedger(plan.entries.map(entry => ledgerEntry({ ...entry, phase: 'idea', decidedBy: 'author' } as never)));
    expect(rendered).toContain("### The author's idea, corrected");
    expect(rendered).toContain("The Ledger of Salt — A harbour clerk who audits the dead finds his own name on a manifest. (the author's reason: too grim for me)");
    expect(rendered).not.toContain('### Do not propose');
  });
});

describe('conceptsStep re-lock', () => {
  it('should supersede the kept card and leave every earlier kill standing', async () => {
    const plan = await materialise({ kept: { optionId: 'c3' }, killed: [{ optionId: 'c2', reason: 'still a prophecy' }] });
    const active = [
      ledgerEntry({ id: 60n, kind: 'direction', topic: 'concepts', stepKey: 'concepts', statement: 'An older logline', payload: null }),
      ledgerEntry({ id: 61n, kind: 'rejected', topic: CONCEPTS_KILLED_TOPIC, stepKey: 'concepts', statement: 'A card killed two rounds ago', payload: null }),
      ledgerEntry({ id: 62n, kind: 'rejected', topic: 'concepts.rejected', stepKey: null, statement: 'Killed while steering', payload: null }),
    ];
    const reconciled = reconcileLockEntries(conceptsStep, plan, active);
    expect(reconciled.supersede.map(pair => pair.previous.id)).toEqual([60n]);
    expect(reconciled.append.map(entry => entry.topic)).toEqual([CONCEPTS_KILLED_TOPIC]);
    expect(reconciled.withdraw).toHaveLength(0);
  });
});

describe('concept limits', () => {
  const card = { id: 'c1', title: 'The Tide Ledger', logline: 'x', engine: 'a debt that grows each tide', hook: 'The sea sends a bill.', fromAuthor: false };

  it('should let a card’s logline run to the schema’s 400 characters, but no further', () => {
    expect(parseSchema(ConceptCardOption, { ...card, logline: 'a'.repeat(400) }).success).toBe(true);
    expect(parseSchema(ConceptCardOption, { ...card, logline: 'a'.repeat(401) }).success).toBe(false);
    expect(parseSchema(ConceptsSelection, { kept: { optionId: 'c1', logline: 'a'.repeat(2000) } }).success).toBe(true);
    expect(parseSchema(ConceptsSelection, { kept: { optionId: 'c1', logline: 'a'.repeat(2001) } }).success).toBe(false);
  });

  it('should take a reason for keeping or killing a card of up to 1,000 characters', () => {
    expect(parseSchema(ConceptsSelection, { kept: { optionId: 'c1', why: 'a'.repeat(1000) }, killed: [{ optionId: 'c2', reason: 'b'.repeat(1000) }] }).success).toBe(true);
    expect(parseSchema(ConceptsSelection, { kept: { optionId: 'c1', why: 'a'.repeat(1001) } }).success).toBe(false);
  });
});

describe('blueprintConceptsPrompt.postValidate', () => {
  it('should refuse an invented card that runs past a pitch line', () => {
    const issues = blueprintConceptsPrompt.postValidate?.(output({ cards: [CARDS[0]!, { ...CARDS[1]!, logline: 'a'.repeat(281) }, CARDS[2]!, CARDS[3]!] }));
    expect(issues?.join(' ')).toContain('pitch line');
  });

  it('should let the fromAuthor card run past a pitch line', () => {
    const issues = blueprintConceptsPrompt.postValidate?.(output({ cards: [{ ...CARDS[0]!, logline: 'a'.repeat(281) }, CARDS[1]!, CARDS[2]!, CARDS[3]!] }));
    expect(issues).toEqual([]);
  });
});

describe('blueprintConceptsPrompt.advise', () => {
  it('should nudge when no card is marked fromAuthor', () => {
    const issues = blueprintConceptsPrompt.advise?.(output({ cards: CARDS.map(card => ({ ...card, fromAuthor: false })) }));
    expect(issues?.join(' ')).toContain('fromAuthor');
  });

  it('should say nothing when one card is already marked fromAuthor', () => {
    expect(blueprintConceptsPrompt.advise?.(output())).toEqual([]);
  });
});
