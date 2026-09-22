import { describe, expect, it } from 'bun:test';

import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type OppositionSliceOptions } from '@modules/blueprint/steps/engine.step';
import { hasAntagonist, oppositionKind, type OppositionSelection, oppositionStep } from '@modules/blueprint/steps/opposition.step';
import { type Ledger } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

const view: OppositionSliceOptions = {
  preselected: 'person',
  why: 'The promise runs on political intrigue.',
  forms: [
    {
      id: 'op_person',
      kind: 'person',
      label: 'A person',
      name: 'Warden Sel',
      summary: 'Rations the oil that keeps the coast lit',
      argument: 'The coast eats what it is not fed.',
      wants: 'A coast that never goes dark',
      neverWill: 'Burn her own ration',
    },
    { id: 'op_slice', kind: 'slice', label: 'Nothing: slice of life', name: 'The lamp house', summary: 'A year of keeping a small light', goals: ['Keep the lamp house open'] },
  ],
};

function selection(overrides: Partial<OppositionSelection> = {}): OppositionSelection {
  return {
    kind: 'person',
    optionId: 'op_person',
    name: 'Warden Sel',
    summary: 'Rations the oil that keeps the coast lit',
    argument: 'The coast eats what it is not fed.',
    wants: 'A coast that never goes dark',
    neverWill: 'Burn her own ration',
    writerLine: 'She is never in the wrong in her own scenes.',
    ...overrides,
  };
}

function materialise(chosen: OppositionSelection, ledger: Ledger.Entry[] = [], page: string | null = null) {
  const context = { round: { round: 1, options: view }, ledger, project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<OppositionSliceOptions | null>;
  return oppositionStep.materialise(chosen, context);
}

const promise = (drivers: string[]): Ledger.Entry => ledgerEntry({ kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', payload: { drivers } });
const locked = (entityKeys: string[], kind = 'person'): Ledger.Entry =>
  ledgerEntry({
    kind: 'decision',
    phase: 'core',
    topic: 'opposition',
    stepKey: 'opposition',
    payload: { kind },
    links: { bibleDocuments: [{ section: 'project', slug: 'opposition' }], entityKeys },
  });

describe('oppositionStep.materialise', () => {
  it('should carry the kind in the decision and make a person into a character', async () => {
    const plan = await materialise(selection());

    expect(plan.entries[0]).toMatchObject({
      kind: 'decision',
      topic: 'opposition',
      statement: 'A person — Warden Sel: Rations the oil that keeps the coast lit',
      payload: { kind: 'person', name: 'Warden Sel', entityKey: 'warden_sel' },
    });
    expect(plan.changeSet).toContainEqual(expect.objectContaining({ op: 'entity.upsert', entityKey: 'warden_sel', type: 'character', motivation: 'A coast that never goes dark' }));

    const page = plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { section: string; slug: string; body: string };
    expect([page.section, page.slug]).toEqual(['project', 'opposition']);
    expect(page.body).toContain('## The case');
    expect(page.body).toContain('The coast eats what it is not fed.');
  });

  it('should make a system into a faction', async () => {
    const plan = await materialise(selection({ kind: 'system', optionId: 'op_system', name: 'The Lamp Office', faces: [{ arc: 'arc one', face: 'A clerk' }] }));

    expect(plan.changeSet).toContainEqual(expect.objectContaining({ op: 'entity.upsert', entityKey: 'the_lamp_office', type: 'faction' }));
    expect((plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { body: string }).body).toContain('- **arc one**: A clerk');
  });

  it('should make no antagonist at all for slice of life, and retire the one an earlier lock made', async () => {
    const plan = await materialise(
      selection({
        kind: 'slice',
        optionId: 'op_slice',
        name: undefined,
        summary: 'A year of keeping a small light',
        goals: ['Keep the lamp house open through winter'],
        rhythm: 'Seasons',
        stakes: 'A regular stops coming',
        returnsFor: 'Comfort',
        argument: undefined,
        wants: undefined,
        neverWill: undefined,
      }),
      [locked(['warden_sel'])],
    );

    expect(plan.changeSet?.some(op => op.op === 'entity.upsert')).toBe(false);
    expect(plan.changeSet).toContainEqual({ op: 'entity.remove', entityKey: 'warden_sel' });
    expect(plan.entries[0]?.payload).toMatchObject({ kind: 'slice' });
    expect(plan.entries[0]?.links?.entityKeys).toBeUndefined();

    const page = plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { body: string };
    expect(page.body).toContain('1. Keep the lamp house open through winter');
    expect(page.body).toContain('## What the reader returns for');
    expect(page.body).not.toContain('## The case');
  });

  it('should clear the sections the previous kind wrote when the kind changes', async () => {
    const before = '# Opposition\n\nA person — Warden Sel\n\n## The case\n\nThe coast eats what it is not fed.\n\n## Rhythm\n\n';
    const plan = await materialise(
      selection({
        kind: 'self',
        optionId: 'op_self',
        name: undefined,
        argument: undefined,
        wants: undefined,
        neverWill: undefined,
        summary: 'His own lie opposes him',
        costOfWinning: 'Every win that makes him useful costs him a friend',
      }),
      [],
      before,
    );
    const page = plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { body: string };

    expect(page.body).not.toContain('The coast eats what it is not fed.');
    expect(page.body).toContain('His own lie opposes him');
  });

  it('should re-lock the same answer without removing what it already materialised', async () => {
    const plan = await materialise(selection(), [locked(['warden_sel'])]);
    expect(plan.changeSet?.some(op => op.op === 'entity.remove')).toBe(false);
  });

  it('should refuse a person with no name, slice of life with no small goals, and the protagonist’s own lie with no price', async () => {
    await expect(materialise(selection({ name: '  ' }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ kind: 'slice', name: undefined, goals: [] }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ kind: 'self', name: undefined }))).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should carry the round’s reason only for an answer that kept the pre-selected kind', async () => {
    const kept = await materialise(selection({ why: undefined }));
    expect(kept.entries[0]?.why).toBe('The promise runs on political intrigue.');

    const changed = await materialise(
      selection({ kind: 'nature', optionId: undefined, name: undefined, why: undefined, argument: undefined, wants: undefined, neverWill: undefined }),
    );
    expect(changed.entries[0]?.why).toBeNull();
  });
});

describe('oppositionKind', () => {
  it('should read the locked kind, and answer slice of life for a novel never asked the question', () => {
    expect(oppositionKind([promise(['mystery']), locked(['warden_sel'])])).toBe('person');
    expect(oppositionKind([promise(['slice_of_life'])])).toBe('slice');
    expect(oppositionKind([promise(['mystery'])])).toBeNull();
    expect(hasAntagonist([promise(['mystery']), locked(['warden_sel'])])).toBe(true);
    expect(hasAntagonist([promise(['slice_of_life'])])).toBe(false);
    expect(hasAntagonist([promise(['mystery']), locked([], 'slice')])).toBe(false);
  });

  it('should not be asked of a slice-of-life novel at all', () => {
    expect(oppositionStep.appliesWhen?.([promise(['slice_of_life'])])).toBe(false);
    expect(oppositionStep.appliesWhen?.([promise(['romance'])])).toBe(true);
  });
});
