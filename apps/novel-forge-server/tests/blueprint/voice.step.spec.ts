import { describe, expect, it } from 'bun:test';

import { BLUEPRINT_CHANGE_OPS } from '@modules/blueprint/engine/blueprint-step.service';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { VOICE_PAGE, type VoiceOptions, type VoiceSelection, voiceStep } from '@modules/blueprint/steps/voice.step';
import { type Ledger } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

const view: VoiceOptions = {
  samples: [
    { id: 'vs1', label: 'Close third, dry', tradeoff: 'Closest to his thinking; hardest to hide what he knows', opening: 'The third door owed the city nine hours.' },
    { id: 'vs2', label: 'First person, present', tradeoff: 'Immediate; loses the street', opening: 'I knock twice.' },
    { id: 'vs3', label: 'Lyrical third', tradeoff: 'The place breathes; the plot slows', opening: 'The town woke wet every morning.' },
  ],
};

function selection(overrides: Partial<VoiceSelection> = {}): VoiceSelection {
  return {
    optionId: 'vs1',
    label: 'Close third, dry wit, short paragraphs',
    notes: 'Stay inside his head, never explain the rules, and keep paragraphs under four sentences.',
    paragraph: 'Widow Pell opened after four knocks, which meant she had been deciding whether to run.',
    ...overrides,
  };
}

function materialise(chosen: VoiceSelection, page: string | null = null) {
  const context = { round: { round: 1, options: view }, ledger: [], project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<VoiceOptions>;
  return voiceStep.materialise(chosen, context);
}

const bodyOf = (plan: Awaited<ReturnType<typeof materialise>>): string => (plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { body: string }).body;

describe('voiceStep.materialise', () => {
  it('should write one decision whose writer line is the voice notes, and record the voices passed over', async () => {
    const plan = await materialise(selection());

    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      kind: 'decision',
      topic: 'voice',
      statement: 'Close third, dry wit, short paragraphs',
      writerLine: 'Stay inside his head, never explain the rules, and keep paragraphs under four sentences.',
      rejectedAlternatives: ['First person, present', 'Lyrical third'],
      links: { bibleDocuments: [VOICE_PAGE] },
    });
  });

  it('should name no offered option in its payload, so a later round’s vs1 cannot be read as this answer', async () => {
    const plan = await materialise(selection());
    expect(plan.entries[0]?.payload).not.toHaveProperty('optionId');
    expect(plan.entries[0]?.payload).toMatchObject({ tradeoff: 'Closest to his thinking; hardest to hide what he knows' });
  });

  it('should write a page whose slug import coverage recognises, carrying the notes and the paragraph', async () => {
    const plan = await materialise(selection());

    expect(VOICE_PAGE.slug).toMatch(/voice|pacing|tone/);
    expect(bodyOf(plan)).toContain('## Voice');
    expect(bodyOf(plan)).toContain('## A paragraph in that voice');
    expect(bodyOf(plan)).toContain('Widow Pell opened after four knocks');
    expect(bodyOf(plan)).toContain('it is not chapter one');
  });

  it('should merge into the tone page rather than rewriting a section it never asked about', async () => {
    const plan = await materialise(selection(), '# Pacing and tone\n\n## Chapter length\n\nAround 2,800 words.');
    expect(bodyOf(plan)).toContain('## Chapter length');
    expect(bodyOf(plan)).toContain('## Voice');
  });

  it('should never persist a sample as prose — a lock may not write a draft at all', async () => {
    const plan = await materialise(selection());

    expect(plan.changeSet?.every(op => !op.op.startsWith('draft.'))).toBe(true);
    expect(plan.changeSet).toHaveLength(1);
    expect(BLUEPRINT_CHANGE_OPS.some(op => op.startsWith('draft.'))).toBe(false);
    const written = JSON.stringify(plan);
    for (const sample of view.samples) expect(written).not.toContain(sample.opening);
  });

  it('should refuse a lock with no notes and one with no paragraph', async () => {
    await expect(materialise(selection({ notes: '  ' }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ paragraph: ' ' }))).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('voiceStep', () => {
  it('should be optional, own the voice topic, and apply to every novel', () => {
    expect(voiceStep.required).toBe(false);
    expect(voiceStep.completionTopics).toEqual(['voice']);
    expect(voiceStep.appliesWhen).toBeUndefined();
    expect(voiceStep.describeOptions(view).map(option => option.id)).toEqual(['vs1', 'vs2', 'vs3']);
    expect(voiceStep.chosenOptionIds(selection())).toEqual(['vs1']);
    expect(voiceStep.chosenOptionIds(selection({ optionId: undefined }))).toEqual([]);
  });
});

describe('voiceStep.inputs', () => {
  const db = { query: { briefs: { findFirst: async () => undefined }, bibleDocuments: { findMany: async () => [] } } };

  const promise = (drivers: string[]): Ledger.Entry =>
    ledgerEntry({ id: 5n, kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', statement: 'A promise', payload: { drivers } });

  const scopeFor = async (ledger: Ledger.Entry[]): Promise<string> => {
    const sections = await voiceStep.inputs!({ projectId: 7n, project: {}, ledger, db, previous: null, input: null, focus: null, catalog: async () => '' } as never);
    return sections.find(section => section.key === 'voice_scope')?.content ?? '';
  };

  it('should choose the third instrument from what the novel promised its reader', async () => {
    expect(await scopeFor([promise(['mystery'])])).toContain('withholds');
    expect(await scopeFor([promise(['progression'])])).toContain('price of power');
    expect(await scopeFor([promise(['slice_of_life'])])).toContain('Unhurried third');
  });

  it('should fall back to a lyrical third for a novel whose drivers name no instrument of their own', async () => {
    expect(await scopeFor([promise(['war_adventure'])])).toContain('Lyrical third');
    expect(await scopeFor([])).toContain('Lyrical third');
  });

  it('should always offer the two that face each other, whatever the third is', async () => {
    const scope = await scopeFor([promise(['mystery'])]);
    expect(scope).toContain('Close third, past, dry and concrete');
    expect(scope).toContain('First person, present');
  });
});
