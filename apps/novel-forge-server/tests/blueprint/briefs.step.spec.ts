import { describe, expect, it } from 'bun:test';

import { blueprintBriefsPrompt } from '@modules/ai/prompts/blueprint-briefs.prompt';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { arcOne, type BriefOption, type BriefsOptions, type BriefsSelection, briefsStep, laterReveals, mergeBriefs, pinnedReveal } from '@modules/blueprint/steps/briefs.step';
import { type Ledger, type PrimaryTransaction } from '@server/database';

import { ledgerEntry } from './blueprint-fixtures';

const ARC_PAYLOAD = {
  volumeKey: 'volume_1',
  arcs: [
    { arcKey: 'volume_1_arc_1', ordinal: 1, title: 'The Round', purpose: 'Show him useful', turn: 'He lies for the first time', chapterStart: 1, chapterEnd: 3 },
    { arcKey: 'volume_1_arc_2', ordinal: 2, title: 'The Audit', purpose: 'Close the net', turn: 'He is named', chapterStart: 4, chapterEnd: 9 },
  ],
};

const REVEALS_PAYLOAD = {
  reveals: [
    {
      factKey: 'reveal_1',
      revealChapter: 60,
      movement: 1,
      when: 'the audit',
      truth: 'The jar holds his mother’s memory',
      writerNote: 'He avoids the jar',
      terms: ['mother'],
      pinned: true,
    },
    {
      factKey: 'reveal_2',
      revealChapter: 120,
      movement: 2,
      when: 'the reckoning',
      truth: 'The office sells them',
      writerNote: 'The office is cheerful',
      terms: ['selling'],
      pinned: false,
    },
  ],
};

const arcsDecision = ledgerEntry({ kind: 'decision', phase: 'volume_one', topic: 'arcs', stepKey: 'arcs', payload: ARC_PAYLOAD, statement: 'The Round → The Audit' });
const revealsDecision = ledgerEntry({ id: 2n, kind: 'decision', phase: 'spine', topic: 'spine.reveals', stepKey: 'spine', payload: REVEALS_PAYLOAD, statement: 'the audit' });

function brief(chapter: number, overrides: Partial<BriefOption> = {}): BriefOption {
  return {
    id: `br${chapter}`,
    chapter,
    title: `Chapter ${chapter}`,
    pov: 'kaen',
    purpose: 'Show him useful',
    objective: 'He walks the round',
    scenes: [{ goal: 'Collect', obstacle: 'A locked door', turn: 'He pockets the jar', beats: ['Dawn round', 'Two knocks'], estimatedWords: 900 }],
    endsOn: 'He pockets the jar',
    mustNotResolve: 'Whose memory it is',
    cites: ['bible_doc:world/setting-overview', 'entity:kaen', 'fact:cost_of_power'],
    readerValue: ['new_information'],
    learns: [],
    hookType: 'promise',
    emotionalBeat: 'Unease',
    handoffState: 'The jar is in his coat',
    continuesIntoNextChapter: false,
    startsFromPreviousChapter: false,
    handoffBeat: '',
    ...overrides,
  };
}

const view: BriefsOptions = {
  arcKey: 'volume_1_arc_1',
  arcTitle: 'The Round',
  chapterStart: 1,
  chapterEnd: 3,
  briefs: [brief(1), brief(2), brief(3, { learns: ['reveal_1'] })],
};

function selection(overrides: Partial<BriefsSelection> = {}): BriefsSelection {
  return {
    briefs: view.briefs.map(item => ({ optionId: item.id, chapter: item.chapter, title: item.title, pov: item.pov, purpose: item.purpose })),
    writerLine: 'Chapter one has to make his job look worth keeping.',
    ...overrides,
  };
}

interface ArcRowOverrides {
  status?: string;
  staleReason?: string | null;
  chapterStart?: number | null;
  chapterEnd?: number | null;
}

function tx(arc: ArcRowOverrides = {}, docSlugs = ['world/setting-overview'], entityKeys = ['kaen'], draftedChapters: number[] = []): PrimaryTransaction {
  const arcs = [
    {
      arcKey: 'volume_1_arc_1',
      volumeKey: 'volume_1',
      ordinal: 1,
      title: 'The Round',
      status: 'approved',
      staleReason: null,
      chapterStart: 1,
      chapterEnd: 3,
      ...arc,
    },
  ];
  return {
    query: {
      volumes: { findMany: async () => [{ volumeKey: 'volume_1', ordinal: 1, status: 'planned' }] },
      arcs: { findMany: async () => arcs },
      bibleDocuments: { findMany: async () => docSlugs.map(ref => ({ section: ref.split('/')[0], slug: ref.split('/')[1] })) },
      entities: { findMany: async () => entityKeys.map(entityKey => ({ entityKey })) },
      drafts: { findMany: async () => draftedChapters.map(chapter => ({ chapter })) },
    },
  } as unknown as PrimaryTransaction;
}

function materialise(chosen: BriefsSelection, ledger: Ledger.Entry[] = [arcsDecision, revealsDecision], transaction = tx()) {
  const context = { round: { round: 1, options: view }, ledger, project: { id: 7n }, tx: transaction } as unknown as MaterialiseContext<BriefsOptions>;
  return briefsStep.materialise(chosen, context);
}

const briefOps = (plan: Awaited<ReturnType<typeof materialise>>) => (plan.changeSet ?? []).filter(op => op.op === 'brief.update');

describe('briefsStep.materialise', () => {
  it('should write one brief per chapter of arc one, carrying POV, purpose and the refs it cites', async () => {
    const plan = await materialise(selection());
    const ops = briefOps(plan);

    expect(ops.map(op => op.chapter)).toEqual([1, 2, 3]);
    expect(ops[0]).toMatchObject({
      chapter: 1,
      arcKey: 'volume_1_arc_1',
      volumeKey: 'volume_1',
      pov: 'kaen',
      chapterPurpose: 'Show him useful',
      readerValue: ['new_information'],
      endingContract: { hookType: 'promise', openQuestion: 'He pockets the jar', mustNotResolve: ['Whose memory it is'] },
    });
    expect(ops[0]?.body).toContain('Goal: Collect.');
    expect(ops[0]?.body).toContain('Beats: Dawn round; Two knocks.');
  });

  it('should keep only the refs that resolve, so a brief never cites a page the project does not have', async () => {
    const plan = await materialise(selection(), [arcsDecision, revealsDecision], tx({}, ['world/setting-overview'], []));
    expect(briefOps(plan)[0]?.contextRefs).toEqual(['bible_doc:world/setting-overview']);
  });

  it('should lower the pinned reveal to the chapter that lands it and name it in that chapter’s knowledge contract', async () => {
    const plan = await materialise(selection());

    expect(plan.changeSet).toContainEqual({ op: 'fact.upsert', factKey: 'reveal_1', revealChapter: 3 });
    expect(briefOps(plan)[2]?.knowledgeContract).toEqual({ pov: ['kaen'], learns: [{ entityKey: 'kaen', factKey: 'reveal_1' }] });
    expect(plan.entries[0]?.payload).toMatchObject({ reveal: { factKey: 'reveal_1', chapter: 3, scheduledChapter: 60 } });
  });

  it('should leave the contract off every chapter that reveals nothing', async () => {
    const ops = briefOps(await materialise(selection()));
    expect(ops[0]?.knowledgeContract).toBeNull();
    expect(ops[1]?.knowledgeContract).toBeNull();
  });

  it('should put the pinned reveal back on its spine schedule when a re-lock no longer lands it in arc one', async () => {
    const before = ledgerEntry({
      id: 3n,
      kind: 'decision',
      phase: 'opening',
      topic: 'briefs',
      stepKey: 'briefs',
      statement: 'The Round: 3 chapter briefs (ch 1–3)',
      payload: { reveal: { factKey: 'reveal_1', chapter: 3, scheduledChapter: 60 } },
      links: { briefChapters: [1, 2, 3] },
    });
    const plan = await materialise(selection({ briefs: selection().briefs.map(item => ({ ...item, optionId: item.chapter === 3 ? 'br1' : item.optionId })) }), [
      arcsDecision,
      revealsDecision,
      before,
    ]);

    expect(plan.changeSet).toContainEqual({ op: 'fact.upsert', factKey: 'reveal_1', revealChapter: 60 });
  });

  it('should keep the reveal dated where it is when a revisit re-locks the titles it read back from the notebook', async () => {
    const before = ledgerEntry({
      id: 3n,
      kind: 'decision',
      phase: 'opening',
      topic: 'briefs',
      stepKey: 'briefs',
      statement: 'The Round: 3 chapter briefs (ch 1–3)',
      payload: { reveal: { factKey: 'reveal_1', chapter: 3, scheduledChapter: 60 } },
      links: { briefChapters: [1, 2, 3] },
    });
    const revisited = selection({ briefs: selection().briefs.map(item => ({ chapter: item.chapter, title: item.title, pov: item.pov, purpose: item.purpose })) });
    const plan = await materialise(revisited, [arcsDecision, revealsDecision, before]);

    expect(plan.changeSet).toContainEqual({ op: 'fact.upsert', factKey: 'reveal_1', revealChapter: 3 });
    expect(plan.changeSet).not.toContainEqual({ op: 'fact.upsert', factKey: 'reveal_1', revealChapter: 60 });
    expect(plan.entries[0]?.payload).toMatchObject({ reveal: { factKey: 'reveal_1', chapter: 3 } });
    expect(plan.changeSet?.some(op => op.op === 'brief.update' && 'knowledgeContract' in op)).toBe(false);
  });

  it('should refuse to drop a brief that already has prose drafted from it', async () => {
    const before = ledgerEntry({ id: 3n, kind: 'decision', phase: 'opening', topic: 'briefs', stepKey: 'briefs', links: { briefChapters: [1, 2, 3, 4] } });
    await expect(materialise(selection(), [arcsDecision, revealsDecision, before], tx({}, ['world/setting-overview'], ['kaen'], [4]))).rejects.toMatchObject({
      code: 'BPR_004',
    });
  });

  it('should retire the brief of a chapter an earlier lock made and this one no longer claims', async () => {
    const before = ledgerEntry({ id: 3n, kind: 'decision', phase: 'opening', topic: 'briefs', stepKey: 'briefs', links: { briefChapters: [1, 2, 3, 4] } });
    const plan = await materialise(selection(), [arcsDecision, revealsDecision, before]);

    expect(plan.changeSet).toContainEqual({ op: 'brief.remove', chapter: 4 });
  });

  it('should link the briefs it wrote and never the arc it only briefed inside', async () => {
    const plan = await materialise(selection());
    expect(plan.entries[0]?.links).toEqual({ arcKeys: ['volume_1_arc_1'], briefChapters: [1, 2, 3] });
    expect(plan.changeSet?.some(op => op.op === 'arc.remove')).toBe(false);
  });

  it('should refuse a lock whose briefs do not cover arc one exactly', async () => {
    await expect(materialise(selection({ briefs: selection().briefs.slice(0, 2) }))).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should refuse to brief an arc that is not approved, or whose volume moved under it', async () => {
    await expect(materialise(selection(), [arcsDecision, revealsDecision], tx({ status: 'planned' }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection(), [arcsDecision, revealsDecision], tx({ staleReason: 'volume_changed' }))).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should refuse a missing writer line and an untitled chapter', async () => {
    await expect(materialise(selection({ writerLine: '  ' }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ briefs: selection().briefs.map((item, index) => (index === 0 ? { ...item, title: ' ' } : item)) }))).rejects.toMatchObject({
      code: 'BPR_004',
    });
  });
});

describe('briefsStep reading the notebook', () => {
  it('should read arc one and the reveal pinned inside volume one out of the ledger', () => {
    expect(arcOne([arcsDecision])).toMatchObject({ arcKey: 'volume_1_arc_1', chapterStart: 1, chapterEnd: 3 });
    expect(pinnedReveal([revealsDecision])).toEqual({ factKey: 'reveal_1', scheduledChapter: 60, when: 'the audit' });
  });

  it('should guard arc one against every later reveal but not against the one it is here to place', () => {
    expect(laterReveals([revealsDecision]).map(reveal => reveal.factKey)).toEqual(['reveal_2']);
  });

  it('should leave the whole arc alone when a round revises one chapter', () => {
    const fresh = [brief(2, { title: 'Brannoc’s Rule', id: 'br1' })];
    const merged = mergeBriefs(view.briefs, fresh, 2);

    expect(merged.map(item => item.title)).toEqual(['Chapter 1', 'Brannoc’s Rule', 'Chapter 3']);
    expect(merged.map(item => item.id)).toEqual(['br1', 'br2', 'br3']);
  });

  it('should take the whole arc from a round that names no chapter', () => {
    expect(mergeBriefs(view.briefs, [brief(1)], null).map(item => item.chapter)).toEqual([1]);
  });
});

describe('briefsStep', () => {
  it('should be required, own the briefs topic and ask every novel for it', () => {
    expect(briefsStep.required).toBe(true);
    expect(briefsStep.completionTopics).toEqual(['briefs']);
    expect(briefsStep.appliesWhen).toBeUndefined();
    expect(briefsStep.describeOptions(view).map(option => option.id)).toEqual(['br1', 'br2', 'br3']);
    expect(briefsStep.chosenOptionIds(selection())).toEqual(['br1', 'br2', 'br3']);
  });
});

describe('blueprintBriefsPrompt.postValidate', () => {
  const brief = (overrides: Record<string, unknown> = {}) => ({
    chapter: 1,
    title: 'The Round',
    pov: 'kaen',
    purpose: 'Show him useful',
    objective: 'He walks the round',
    scenes: [{ goal: 'a', obstacle: 'b', turn: 'c', beats: ['x', 'y'], estimatedWords: 900 }],
    endsOn: 'He pockets the jar',
    mustNotResolve: 'Whose memory is in it',
    cites: [],
    readerValue: ['new_information'],
    endingContract: { hookType: 'promise', emotionalBeat: 'a', openQuestion: 'b', handoffState: 'c' },
    ...overrides,
  });
  const check = (overrides: Record<string, unknown> = {}): string[] =>
    blueprintBriefsPrompt.postValidate?.({ arcTitle: 'The Round', briefs: [brief(overrides)], coachMessage: 'ok' } as never) ?? [];

  it('should accept a brief that withholds one specific thing', () => {
    expect(check()).toEqual([]);
  });

  it('should refuse a withholding that only restates what the chapter ends on', () => {
    expect(check({ mustNotResolve: 'He pockets the jar' })[0]).toContain('restates');
    expect(check({ mustNotResolve: 'He pockets the jar, and why.' })[0]).toContain('restates');
  });

  it('should refuse a withholding that names a category rather than a thing', () => {
    expect(check({ mustNotResolve: 'The mystery' })[0]).toContain('category');
    expect(check({ mustNotResolve: 'everything' })[0]).toContain('category');
  });
});
