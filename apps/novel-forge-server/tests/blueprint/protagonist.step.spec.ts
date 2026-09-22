import { describe, expect, it } from 'bun:test';

import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type ProtagonistSliceOptions } from '@modules/blueprint/steps/engine.step';
import { type ProtagonistLeadChoice, type ProtagonistSelection, protagonistStep } from '@modules/blueprint/steps/protagonist.step';
import { type Ledger } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

const CRUCIBLE = { wound: 'Left at the harbour at six', want: 'A keeper’s licence', need: 'To be wanted when useless', change: 'From useful to chosen' };

const view: ProtagonistSliceOptions = {
  leads: [{ id: 'l1', name: 'Arden', descriptor: '17, lamp apprentice' }],
  versions: [
    { id: 'pv1', leadId: 'l1', lie: '"If I stay useful, nobody leaves"', ...CRUCIBLE, chapterOne: 'Runs the lamp round early' },
    { id: 'pv2', leadId: 'l1', lie: '"Everyone can be bought"', ...CRUCIBLE, chapterOne: 'Haggles a widow down' },
  ],
};

function lead(overrides: Partial<ProtagonistLeadChoice> = {}): ProtagonistLeadChoice {
  return {
    optionId: 'pv1',
    name: 'Arden',
    descriptor: '17, lamp apprentice',
    lie: '"If I stay useful, nobody leaves"',
    ...CRUCIBLE,
    chapterOne: 'Runs the lamp round early',
    ...overrides,
  };
}

function selection(overrides: Partial<ProtagonistSelection> = {}): ProtagonistSelection {
  return { leads: [lead()], writerLine: 'Every scene shows him making himself needed.', ...overrides };
}

function materialise(chosen: ProtagonistSelection, ledger: Ledger.Entry[] = [], page: string | null = null) {
  const context = { round: { round: 1, options: view }, ledger, project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<ProtagonistSliceOptions | null>;
  return protagonistStep.materialise(chosen, context);
}

const locked = (entityKeys: string[]): Ledger.Entry =>
  ledgerEntry({ kind: 'decision', phase: 'core', topic: 'protagonist', stepKey: 'protagonist', links: { bibleDocuments: [{ section: 'project', slug: 'cast' }], entityKeys } });

describe('protagonistStep.materialise', () => {
  it('should write one decision carrying the lie and materialise the lead as a character on the cast page', async () => {
    const plan = await materialise(selection());

    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      kind: 'decision',
      topic: 'protagonist',
      statement: 'Arden — "If I stay useful, nobody leaves"',
      writerLine: 'Every scene shows him making himself needed.',
      rejectedAlternatives: ['"Everyone can be bought"'],
      links: { entityKeys: ['arden'], bibleDocuments: [{ section: 'project', slug: 'cast' }] },
    });
    expect(plan.changeSet).toContainEqual(expect.objectContaining({ op: 'entity.upsert', entityKey: 'arden', type: 'character', name: 'Arden', status: 'Protagonist' }));

    const page = plan.changeSet?.find(op => op.op === 'bible_document.upsert');
    expect(page).toMatchObject({ section: 'project', slug: 'cast' });
    expect((page as { body: string }).body).toContain('## Protagonist');
    expect((page as { body: string }).body).toContain('- Lie: "If I stay useful, nobody leaves"');
  });

  it('should keep the sections of the cast page it did not ask about', async () => {
    const plan = await materialise(selection(), [], '# Cast\n\n## Protagonist\n\nold\n\n## Supporting\n\nKeep me');
    const page = plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { body: string };

    expect(page.body).toContain('## Supporting\n\nKeep me');
    expect(page.body).not.toContain('old');
  });

  it('should materialise both leads when the author asked for two', async () => {
    const plan = await materialise(selection({ leads: [lead(), lead({ optionId: undefined, name: 'Wren', lie: '"Nobody stays"' })] }));

    expect(plan.entries[0]?.statement).toBe('Arden — "If I stay useful, nobody leaves" · Wren — "Nobody stays"');
    expect(plan.entries[0]?.links?.entityKeys).toEqual(['arden', 'wren']);
    expect(plan.changeSet?.filter(op => op.op === 'entity.upsert')).toHaveLength(2);
  });

  it('should re-lock the same answer without removing or duplicating what it already materialised', async () => {
    const plan = await materialise(selection(), [locked(['arden'])]);

    expect(plan.changeSet?.some(op => op.op === 'entity.remove')).toBe(false);
    expect(plan.changeSet?.filter(op => op.op === 'entity.upsert')).toHaveLength(1);
  });

  it('should remove the character an earlier lock made when the lead is renamed', async () => {
    const plan = await materialise(selection({ leads: [lead({ name: 'Wren' })] }), [locked(['arden'])]);

    expect(plan.changeSet).toContainEqual({ op: 'entity.remove', entityKey: 'arden' });
    expect(plan.changeSet).toContainEqual(expect.objectContaining({ op: 'entity.upsert', entityKey: 'wren' }));
  });

  it('should refuse a lead without a lie, two leads of one name, and a missing writer line', async () => {
    await expect(materialise(selection({ leads: [lead({ lie: '  ' })] }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ leads: [lead(), lead({ optionId: undefined })] }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ writerLine: '   ' }))).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('protagonistStep', () => {
  it('should offer the versions as its options and name the versions the author took', () => {
    expect(protagonistStep.describeView(view)).toEqual([
      { id: 'pv1', label: '"If I stay useful, nobody leaves"' },
      { id: 'pv2', label: '"Everyone can be bought"' },
    ]);
    expect(protagonistStep.describeView(null)).toEqual([]);
    expect(protagonistStep.chosenOptionIds(selection())).toEqual(['pv1']);
    expect(protagonistStep.chosenOptionIds(selection({ leads: [lead({ optionId: undefined })] }))).toEqual([]);
  });
});
