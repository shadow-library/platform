import { describe, expect, it, mock } from 'bun:test';

import { renderRevealSchedule, scheduledReveals } from '@modules/ai/context/canon-guard';
import { blueprintSpinePrompt } from '@modules/ai/prompts/blueprint-spine.prompt';
import { type BlueprintSpineOutput } from '@modules/ai/schemas/blueprint-spine.schema';
import { loadWriterHiddenFactKeys, renderHiddenConstraints, scrubForWriter } from '@modules/bible/fact/knowledge-view';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { spineChapterTarget, spineMode, type SpineOptions, spinePass, type SpineSliceOptions } from '@modules/blueprint/steps/spine-pass.step';
import { revealChapterOf, SPINE_PAGE, type SpineRevealChoice, type SpineSelection, spineStep, volumeKeyOf } from '@modules/blueprint/steps/spine.step';
import { type Ledger } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

function output(overrides: Partial<BlueprintSpineOutput> = {}): BlueprintSpineOutput {
  return {
    movements: [
      { title: 'Discovery', summary: 'The stolen tithes; one is his', change: 'useful', chapters: 60 },
      { title: 'Complicity', summary: 'He works for the Office to find answers', change: 'used', chapters: 50 },
      { title: 'Choice', summary: 'The ending question', change: 'chooses', chapters: 40 },
    ],
    reveals: [
      { movement: 1, when: 'End arc 1', truth: 'The memory in the jar is his', writerNote: 'Keep the jar shut and never say whose memory it holds', terms: ['his own memory'] },
      { movement: 3, when: 'Volume 3', truth: 'Who sold his childhood', writerNote: 'Nobody names the seller' },
    ],
    note: 'The last movement answers the question by refusing to take the memory back.',
    coachMessage: 'Three movements, each leaving him somewhere new.',
    ...overrides,
  };
}

const promise = (drivers: string[], length = 'medium'): Ledger.Entry =>
  ledgerEntry({ kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', statement: 'A promise', payload: { drivers, length } });

const ending = (statement: string): Ledger.Entry => ledgerEntry({ kind: 'decision', phase: 'heart', topic: 'ending', stepKey: 'heart', statement });

const roundOf = (ledger: Ledger.Entry[] = [], out = output()): SpineOptions => spinePass.toRound(out, { previous: null, input: null, focus: null, ledger }).options;

function selection(overrides: Partial<SpineSelection> = {}): SpineSelection {
  return {
    movements: [
      { optionId: 'mv1', title: 'Discovery', summary: 'The stolen tithes; one is his', change: 'useful', chapters: 60 },
      { optionId: 'mv2', title: 'Complicity', summary: 'He works for the Office to find answers', change: 'used', chapters: 50 },
      { optionId: 'mv3', title: 'Choice', summary: 'The ending question', change: 'chooses', chapters: 40 },
    ],
    reveals: [
      {
        optionId: 'rv1',
        movement: 1,
        when: 'End arc 1',
        truth: 'The memory in the jar is his',
        writerNote: 'Keep the jar shut and never say whose memory it holds',
        terms: ['his own memory'],
      },
      { optionId: 'rv2', movement: 3, when: 'Volume 3', truth: 'Who sold his childhood', writerNote: 'Nobody names the seller' },
    ],
    writerLine: 'Chapter one belongs to the first movement: he is still useful to everyone.',
    ...overrides,
  };
}

function materialise(chosen: SpineSelection, ledger: Ledger.Entry[] = [], page: string | null = null) {
  const view = roundOf(ledger).spine ?? null;
  const context = { round: { round: 1, options: view }, ledger, project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<SpineSliceOptions | null>;
  return spineStep.materialise(chosen, context);
}

const locked = (volumeKeys: string[]): Ledger.Entry =>
  ledgerEntry({ kind: 'decision', phase: 'spine', topic: 'spine', stepKey: 'spine', links: { bibleDocuments: [SPINE_PAGE], volumeKeys } });

const bodyOf = (plan: Awaited<ReturnType<typeof materialise>>): string => (plan.changeSet?.find(op => op.op === 'bible_document.upsert') as { body: string }).body;

describe('spinePass.toRound', () => {
  it('should number the movements and pin only the first reveal', () => {
    const slice = roundOf().spine;

    expect(slice?.movements.map(movement => movement.id)).toEqual(['mv1', 'mv2', 'mv3']);
    expect(slice?.reveals.map(reveal => ({ id: reveal.id, pinned: reveal.pinned }))).toEqual([
      { id: 'rv1', pinned: true },
      { id: 'rv2', pinned: false },
    ]);
  });

  it('should take the mode, the ending question and whether reveals are required from the locked decisions, never from the model', () => {
    const mystery = roundOf([promise(['mystery']), ending('Will he recover his past, or choose who he became without it?')]).spine;
    expect(mystery).toMatchObject({ mode: 'movements', revealsRequired: true, endingQuestion: 'Will he recover his past, or choose who he became without it?' });

    const slice = roundOf([promise(['slice_of_life'])]).spine;
    expect(slice).toMatchObject({ mode: 'seasons', revealsRequired: false });
  });

  it('should offer every movement and reveal with ids unique across the round', () => {
    const ids = spinePass.describeOptions(roundOf()).map(option => option.id);
    expect(ids).toEqual(['mv1', 'mv2', 'mv3', 'rv1', 'rv2']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should plan around the length the reader promise asked for', () => {
    expect(spineChapterTarget([promise(['mystery'], 'short')])).toBe(60);
    expect(spineChapterTarget([promise(['mystery'], 'long')])).toBe(300);
    expect(spineChapterTarget([])).toBe(150);
  });

  it('should refuse a round that produced no movement at all', () => {
    expect(() => spinePass.toRound(output({ movements: [] }), { previous: null, input: null, focus: null, ledger: [] })).toThrow();
  });

  it('should say that a movement repeating the last one’s change is the volume before it written again', () => {
    const issues = blueprintSpinePrompt.postValidate?.(
      output({
        movements: [
          { title: 'A', summary: 'a', change: 'useful', chapters: 10 },
          { title: 'B', summary: 'b', change: 'useful', chapters: 10 },
        ],
      }),
    );
    expect(issues?.join(' ')).toContain('two movements in a row');
  });
});

describe('spineStep.materialise', () => {
  it('should write the shape and the reveals as two decisions, and the movements as sketch volumes', async () => {
    const plan = await materialise(selection());

    expect(plan.entries.map(entry => entry.topic)).toEqual(['spine', 'spine.reveals']);
    expect(plan.entries[0]).toMatchObject({ statement: 'Discovery → Complicity → Choice', links: { volumeKeys: ['volume_1', 'volume_2', 'volume_3'] } });

    const volumes = plan.changeSet?.filter(op => op.op === 'volume.upsert') ?? [];
    expect(volumes).toHaveLength(3);
    expect(volumes[0]).toMatchObject({ volumeKey: volumeKeyOf(1), ordinal: 1, title: 'Discovery', targetChapterCount: 60, payoff: 'useful' });
  });

  it('should approve the volume plan after the commit, because an action cannot run inside the lock', async () => {
    const plan = await materialise(selection());
    const runActions = mock(async () => undefined);

    await plan.afterCommit?.({ projectId: 7n, entries: [], proposal: null, runActions });
    expect(runActions).toHaveBeenCalledWith([{ op: 'action.approve_volume_plan' }]);
  });

  it('should head the page with the pinned ending question and mark which reveal is pinned, without ever writing a truth onto it', async () => {
    const plan = await materialise(selection(), [ending('Will he recover his past?')]);
    const body = bodyOf(plan);

    expect(body).toContain('**Ending question:** Will he recover his past?');
    expect(body).toContain('## Movements');
    expect(body).toContain('## Reveal schedule');
    expect(body).toContain('*(pinned)*');
    expect(body).toContain('not before chapter 60 `reveal_1`');
    expect(body).not.toContain('The memory in the jar is his');
    expect(body).not.toContain('Who sold his childhood');
  });

  it('should mint one scheduled canon fact per reveal, carrying the note and the terms but never opening it early', async () => {
    const plan = await materialise(selection());
    const facts = plan.changeSet?.filter(op => op.op === 'fact.upsert') ?? [];

    expect(facts).toEqual([
      {
        op: 'fact.upsert',
        factKey: 'reveal_1',
        body: 'The memory in the jar is his',
        revealChapter: 60,
        writerNote: 'Keep the jar shut and never say whose memory it holds',
        terms: ['his own memory'],
        constraintNote: 'Comes out End arc 1.',
      },
      {
        op: 'fact.upsert',
        factKey: 'reveal_2',
        body: 'Who sold his childhood',
        revealChapter: 150,
        writerNote: 'Nobody names the seller',
        constraintNote: 'Comes out Volume 3.',
      },
    ]);
    expect(plan.entries[1]?.links?.factKeys).toEqual(['reveal_1', 'reveal_2']);
  });

  it('should keep every reveal out of a chapter-one writer’s hands, leaving only the note behind', async () => {
    const plan = await materialise(selection());
    const rows = (plan.changeSet?.filter(op => op.op === 'fact.upsert') ?? []).map((fact, index) => ({
      id: BigInt(index + 1),
      factKey: fact.factKey,
      text: fact.body ?? '',
      revealChapter: fact.revealChapter ?? null,
      constraintNote: fact.constraintNote ?? null,
      writerNote: fact.writerNote ?? null,
      terms: fact.terms ?? null,
      source: 'manual' as const,
    }));
    const db = { query: { briefs: { findFirst: async () => undefined }, characterKnowledge: { findMany: async () => [] } } };

    const hidden = await loadWriterHiddenFactKeys(db as never, 7n, 1, rows as never);
    expect([...hidden].sort()).toEqual(['reveal_1', 'reveal_2']);

    const forbidden = rows.filter(row => hidden.has(row.factKey));
    expect(renderHiddenConstraints(forbidden as never)).toContain('Keep the jar shut');
    expect(renderHiddenConstraints(forbidden as never)).not.toContain('The memory in the jar is his');
    expect(scrubForWriter('He knows the memory in the jar is his.', forbidden as never)).not.toContain('memory in the jar is his');
  });

  it('should give the planner a reveal schedule that names the fact and the chapter, never the truth', async () => {
    const plan = await materialise(selection());
    const rows = (plan.changeSet?.filter(op => op.op === 'fact.upsert') ?? []).map(fact => ({
      factKey: fact.factKey,
      revealChapter: fact.revealChapter ?? null,
      terms: fact.terms ?? null,
      writerNote: fact.writerNote ?? null,
      source: 'manual' as const,
    }));

    const { lines } = renderRevealSchedule(scheduledReveals(rows), { start: 1, end: 10 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('reveal_1 — reveals ch 60');
    expect(lines[0]).toContain('never name: his own memory');
    expect(lines.join(' ')).not.toContain('The memory in the jar is his');
  });

  it('should refuse a reveal with no writer note, and one whose note states the truth', async () => {
    const pinned = (selection().reveals ?? [])[0] as SpineRevealChoice;
    await expect(materialise(selection({ reveals: [{ ...pinned, writerNote: ' ' }] }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ reveals: [{ ...pinned, writerNote: 'Never say that the memory in the jar is his until arc one ends' }] }))).rejects.toMatchObject({
      code: 'BPR_004',
    });
  });

  it('should schedule a reveal to the last chapter of the movement it is placed in', () => {
    const movements = [
      { title: 'A', summary: 'a', change: 'one', chapters: 60 },
      { title: 'B', summary: 'b', change: 'two', chapters: 50 },
    ].map((movement, index) => ({ movement, ordinal: index + 1, volumeKey: `volume_${index + 1}` }));

    expect(revealChapterOf(movements, 1)).toBe(60);
    expect(revealChapterOf(movements, 2)).toBe(110);
    expect(revealChapterOf(movements, 9)).toBe(110);
  });

  it('should call them seasons and milestones for a slice-of-life novel', async () => {
    const ledger = [promise(['slice_of_life'])];
    expect(spineMode(ledger)).toBe('seasons');

    const body = bodyOf(await materialise(selection(), ledger));
    expect(body).toContain('## Seasons');
    expect(body).toContain('## Milestones');
    expect(body).not.toContain('## Movements');
  });

  it('should refuse a mystery whose reveal schedule is empty, and accept the same answer without mystery', async () => {
    const empty = selection({ reveals: [] });
    await expect(materialise(empty, [promise(['mystery'])])).rejects.toMatchObject({ code: 'BPR_004' });

    const plan = await materialise(empty, [promise(['romance'])]);
    expect(plan.entries.map(entry => entry.topic)).toEqual(['spine']);
  });

  it('should refuse a movement with no change and a missing writer line', async () => {
    await expect(materialise(selection({ movements: [{ title: 'Discovery', summary: 'x', change: '  ', chapters: 10 }] }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ writerLine: ' ' }))).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should re-lock the same spine without touching a volume, and remove one the author dropped', async () => {
    const first = await materialise(selection());
    const links = first.entries[0]?.links ?? {};
    const same = await materialise(selection(), [locked(links.volumeKeys ?? [])]);
    expect(same.changeSet).toEqual(first.changeSet!);

    const shorter = await materialise(selection({ movements: selection().movements.slice(0, 2) }), [locked(['volume_1', 'volume_2', 'volume_3'])]);
    expect(shorter.changeSet).toContainEqual({ op: 'volume.remove', volumeKey: 'volume_3' });
  });

  it('should replace only its own two topics, so a direction kept while steering survives', () => {
    expect(spineStep.completionTopics).toEqual(['spine']);
    expect(spineStep.appliesWhen).toBeUndefined();
  });
});
