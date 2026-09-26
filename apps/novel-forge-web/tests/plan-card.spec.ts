import { describe, expect, it } from 'bun:test';

import { ApiError } from '../src/lib/apis/transport';
import {
  addablePages,
  changeSetWith,
  claimableMilestones,
  createLatestQueue,
  createPlanFlow,
  endingProblem,
  everySceneFrom,
  findPlanOp,
  isBlankPlan,
  isWriterExcludedDoc,
  keptBackStructure,
  learnsWithoutPov,
  lengthChoices,
  planDraftOf,
  planErrorView,
  type PlanOp,
  planOpOf,
  planWarningsOf,
  planWords,
  refLabel,
  refusedFactKeys,
  resolvedContentMode,
  sceneAfterRemoving,
  startedEmpty,
  withLength,
  withNewScene,
  withoutReveals,
  withScene,
  writeErrorView,
  writeStopNotice,
} from '../src/lib/plan-card';

const OP: PlanOp = {
  op: 'brief.update',
  chapter: 4,
  title: 'What the ledger says',
  body: 'Hollis shows Tamsin the ledger.',
  contextRefs: ['entity:hollis', 'bible_doc:world/the-ledger'],
  pov: 'tamsin',
  chapterPurpose: 'Tamsin learns the ledger lied about her.',
  readerValue: ['the empty Rook line'],
  densityRisk: 'two scenes for a long chapter',
  endingContract: { hookType: 'revelation', emotionalBeat: 'dread', openQuestion: 'Who hid her?', handoffState: 'Tamsin counts the years again.', mustNotResolve: [] },
  scenes: [
    { summary: 'Hollis carries the tin box up.', pov: 'tamsin', goal: 'See inside', estimatedWords: 1200 },
    { summary: 'Hollis rehearses what he will say.', pov: 'hollis', beats: ['He opens the lid', 'He shuts it'], estimatedWords: 800 },
  ],
  claimedMilestones: ['empty_rook_line'],
  knowledgeContract: { pov: ['tamsin', 'hollis'], learns: [{ entityKey: 'tamsin', factKey: 'rook_unpaid' }] },
  direction: 'Hollis opens the ledger',
  rationale: 'What the story owes now:\n- Chapter 3 ends on "why the sea turned"',
};

const POOLING =
  'Scene 2\'s point of view (Hollis) knows "The council paid for silence", which scene 1 (Tamsin) does not; the writer will have it for the whole chapter — split into two chapters, or keep it (a clue check will run).';
const LEARNED = '"Why Tamsin never paid" is learned in scene 3 — it must not colour earlier scenes; the writer has it for the whole chapter (a clue check will run).';

const conflict = (code: string, message = 'raw'): ApiError => new ApiError(409, { code, type: 'CONFLICT', message });

describe('plan card edits', () => {
  it('should find the plan op among the card’s operations', () => {
    expect(findPlanOp({ changeSet: [{ op: 'entity.upsert' }, OP] })?.index).toBe(1);
    expect(findPlanOp({ changeSet: [{ op: 'entity.upsert' }] })).toBeNull();
  });

  it('should write an untouched draft back as the op it came from', () => {
    expect(planOpOf(OP, planDraftOf(OP))).toEqual(OP);
  });

  it('should round-trip a title edit without touching the content mode or anything else', () => {
    const draft = { ...planDraftOf(OP), title: '  The ledger  ' };
    const [, op] = changeSetWith([{ op: 'entity.upsert' }, OP], { index: 1, op: OP }, draft);
    expect(op).toEqual({ ...OP, title: 'The ledger' });
    expect(op).not.toHaveProperty('contentMode');
  });

  it('should send a cleared title or purpose as empty rather than leaving the old one in place', () => {
    const op = planOpOf(OP, { ...planDraftOf(OP), title: ' ', purpose: '' });
    expect(op.title).toBe('');
    expect(op.chapterPurpose).toBe('');
    const empty: PlanOp = { op: 'brief.update', chapter: 5, body: '', scenes: [], claimedMilestones: [] };
    expect(planOpOf(empty, planDraftOf(empty))).not.toHaveProperty('title');
  });

  it('should set the content mode only from the author’s choice, and send null to follow the novel again', () => {
    expect(planDraftOf(OP).contentMode).toBeUndefined();
    expect(planOpOf(OP, { ...planDraftOf(OP), contentMode: 'unrestricted' }).contentMode).toBe('unrestricted');
    expect(planOpOf(OP, { ...planDraftOf(OP), contentMode: null }).contentMode).toBeNull();
    expect(planDraftOf({ ...OP, contentMode: null }).contentMode).toBeNull();
  });

  it('should read the mode a card leaves alone as the chapter’s own', () => {
    expect(resolvedContentMode({ contentMode: undefined }, 'unrestricted')).toBe('unrestricted');
    expect(resolvedContentMode({ contentMode: null }, 'unrestricted')).toBeNull();
    expect(resolvedContentMode({ contentMode: 'standard' }, null)).toBe('standard');
  });

  it('should pool the writer’s knowledge over the scenes’ points of view, keeping what the chapter reveals', () => {
    const draft = planDraftOf(OP);
    const retold = withScene(draft, draft.scenes[1]!.id, { pov: 'tamsin' });
    expect(planOpOf(OP, retold).knowledgeContract).toEqual({ pov: ['tamsin'], learns: [{ entityKey: 'tamsin', factKey: 'rook_unpaid' }] });
    expect(retold.densityRisk).toBe(OP.densityRisk as string);
  });

  it('should warn when a character who learns something on the page no longer tells a scene', () => {
    const draft = everySceneFrom(planDraftOf(OP), 'hollis');
    expect(learnsWithoutPov(draft, new Map([['tamsin', 'Tamsin']]))).toEqual([
      'Tamsin learns "Rook unpaid" on the page, but no scene is told by them now — give them a scene, or drop the reveal.',
    ]);
    expect(learnsWithoutPov(planDraftOf(OP), new Map())).toEqual([]);
  });

  it('should drop only the refused reveals, and nothing when the refusal names none', () => {
    const draft = { ...planDraftOf(OP), learns: [...(planDraftOf(OP).learns ?? []), { entityKey: 'hollis', factKey: 'council_bribe' }] };
    expect(withoutReveals(draft, ['rook_unpaid']).learns).toEqual([{ entityKey: 'hollis', factKey: 'council_bribe' }]);
    expect(withoutReveals(draft, [])).toBe(draft);
  });

  it('should still write the dropped reveal back when no scene names a point of view', () => {
    const op: PlanOp = { ...OP, scenes: [{ summary: 'Nobody tells this yet.', pov: null }], pov: null };
    const op2 = planOpOf(op, withoutReveals(planDraftOf(op), ['rook_unpaid']));
    expect(op2.knowledgeContract).toEqual({ pov: ['tamsin', 'hollis'], learns: [] });
  });

  it('should hold back a scene until it says what happens, and clear the planner’s density note once the scenes change', () => {
    const draft = withNewScene(planDraftOf(OP), 'tamsin');
    expect(draft.scenes.map(scene => scene.id)).toEqual(['scene-0', 'scene-1', 'scene-2']);
    expect(planOpOf(OP, draft).scenes).toHaveLength(2);
    const filled = withScene(draft, 'scene-2', { summary: 'She walks the wall.' });
    const op = planOpOf(OP, filled);
    expect(op.scenes).toHaveLength(3);
    expect(op.densityRisk).toBeNull();
  });

  it('should move focus to the next scene after a removal, else the previous', () => {
    const scenes = planDraftOf(OP).scenes;
    expect(sceneAfterRemoving(scenes, 'scene-0')).toBe('scene-1');
    expect(sceneAfterRemoving(scenes, 'scene-1')).toBe('scene-0');
    expect(sceneAfterRemoving(scenes.slice(0, 1), 'scene-0')).toBeNull();
  });

  it('should keep the last whole ending while a part of it is blank, and say which part', () => {
    const draft = planDraftOf(OP);
    const partial = { ...draft, ending: { ...draft.ending, openQuestion: ' ' } };
    expect(planOpOf(OP, partial).endingContract).toEqual(OP.endingContract);
    expect(endingProblem(partial.ending)).toBe('The ending is saved once it has all four parts — still missing: the question left open.');
    expect(endingProblem(draft.ending)).toBeNull();
  });

  it('should start an empty plan’s ending once all four parts are filled', () => {
    const empty: PlanOp = { op: 'brief.update', chapter: 5, body: '', scenes: [], claimedMilestones: [] };
    const draft = planDraftOf(empty);
    const ending = { hookType: 'turn' as const, emotionalBeat: 'relief', openQuestion: 'What next?', handoffState: 'She sleeps.', mustNotResolve: [] };
    expect(planOpOf(empty, { ...draft, ending }).endingContract).toEqual(ending);
    expect(planOpOf(empty, draft)).not.toHaveProperty('endingContract');
  });

  it('should count a plan blank until it has both a title and a scene', () => {
    const draft = planDraftOf(OP);
    expect(isBlankPlan(draft)).toBe(false);
    expect(isBlankPlan({ ...draft, title: '' })).toBe(true);
    expect(isBlankPlan({ ...draft, scenes: [] })).toBe(true);
  });

  it('should tell a card that started empty from one the planner filled', () => {
    expect(startedEmpty(OP)).toBe(false);
    expect(startedEmpty({ op: 'brief.update', chapter: 5, title: 'Typed in by the author', scenes: [] })).toBe(true);
  });

  it('should spread a new length in proportion when every scene has a share', () => {
    const draft = withLength(planDraftOf(OP), 3000);
    expect(draft.scenes.map(scene => scene.estimatedWords)).toEqual([1800, 1200]);
    expect(planWords(draft.scenes)).toBe(3000);
    expect(draft.densityRisk).toBeNull();
  });

  it('should spread a length evenly when a scene has no share yet', () => {
    const draft = planDraftOf({
      ...OP,
      scenes: [
        { summary: 'One', pov: 'tamsin' },
        { summary: 'Two', pov: 'tamsin', estimatedWords: 900 },
      ],
    });
    expect(planWords(draft.scenes)).toBeNull();
    expect(withLength(draft, 2000).scenes.map(scene => scene.estimatedWords)).toEqual([1000, 1000]);
  });

  it('should offer the current length among the choices', () => {
    expect(lengthChoices(2740)).toContain(2700);
    expect(lengthChoices(3000)).not.toContain(2700);
  });
});

describe('plan card warnings', () => {
  it('should sort the server’s diagnostics by kind, pooling apart, each once', () => {
    const warnings = planWarningsOf(
      [
        POOLING,
        LEARNED,
        POOLING,
        'Give-away: scene 2\'s summary names a term of "The council paid", which is still locked here — reword it before the writer reads it.',
        'Scene 3 names no point of view — pick one on the card.',
        'Scene 1\'s point of view "gull" is not a character in the Story Bible — pick one on the card.',
        'Density: 2 scene(s) for a 1800–2600 word chapter, which usually takes 3 — keep it if that is what you intend.',
        'The removal is written as a negation.',
      ],
      planDraftOf(OP),
      new Map(),
    );
    expect(warnings.pooling).toEqual([POOLING, LEARNED]);
    expect(warnings.giveaway).toHaveLength(1);
    expect(warnings.pov).toHaveLength(2);
    expect(warnings.density).toHaveLength(1);
    expect(warnings.other).toEqual(['The removal is written as a negation.']);
  });

  it('should explain an apply refusal in the author’s terms, with the way out it allows', () => {
    expect(planErrorView(conflict('PLN_008'))).toMatchObject({ title: 'The story has moved on', replan: true });
    const locked = planErrorView(
      conflict('PLN_001', 'The plan for chapter 4 reveals facts that are still locked there: rook_unpaid (needs lamp_rank_3); council_bribe (needs chapter 6)'),
    );
    expect(locked.title).toBe('A reveal in this plan isn’t unlocked here');
    expect(locked.dropReveals).toBeUndefined();
    const learns = [{ entityKey: 'tamsin', factKey: 'rook_unpaid' }];
    const refused = conflict('PLN_001', 'The plan for chapter 4 reveals facts that are still locked there: rook_unpaid (needs lamp_rank_3); council_bribe (needs chapter 6)');
    expect(refusedFactKeys(refused)).toEqual(['rook_unpaid', 'council_bribe']);
    expect(planErrorView(refused, learns).dropReveals).toEqual(['rook_unpaid']);
    expect(planErrorView(conflict('PLN_001', 'The plan reveals something locked — reworded by the server'), learns).dropReveals).toBeUndefined();
    expect(planErrorView(conflict('PLN_003', 'The plan for chapter 4 cannot claim these milestones: a is not a milestone of this novel')).message).toBe(
      'a is not a milestone of this novel. Remove it from “This chapter reaches”.',
    );
    expect(planErrorView(conflict('XYZ_001'))).toEqual({ title: 'Couldn’t save the plan', message: 'raw', replan: false });
  });

  it('should say readably why writing did not start, and offer a retry only where one helps', () => {
    expect(writeErrorView(conflict('DRF_016', 'Chapter 5 cannot be written by the AI until chapter 4 is approved.'))).toEqual({
      message: 'Chapter 5 cannot be written by the AI until chapter 4 is approved.',
      retry: false,
    });
    expect(writeErrorView(conflict('DRF_018', 'Only chapter 6 can be started now')).message).toBe('Chapters are written in order: Only chapter 6 can be started now');
    expect(writeErrorView(conflict('NET_001', 'offline'))).toEqual({ message: 'offline', retry: true });
    expect(writeStopNotice({ jobId: 'j', kind: 'generate', status: 'queued', target: '4', stoppedAtExternalChapter: 4 }, 4)?.message).toContain(
      'written outside the primary model',
    );
    expect(writeStopNotice({ jobId: 'j', kind: 'generate', status: 'queued', target: '4' }, 4)).toBeNull();
  });

  it('should not take a job already writing another chapter for this one', () => {
    expect(writeStopNotice({ jobId: 'j', kind: 'generate', status: 'running', target: '3' }, 4)).toEqual({
      message: 'Another chapter is being written. Try again once it finishes.',
      retry: true,
    });
  });
});

describe('plan card writer material', () => {
  it('should keep the fixed kept-back lines, and the ending off them on the ending chapter', () => {
    expect(keptBackStructure(false)).toContain('how the book ends');
    expect(keptBackStructure(true)).not.toContain('how the book ends');
  });

  it('should name chosen pages by their Story Bible labels, falling back to the ref', () => {
    const pages = [{ ref: 'bible_doc:world/the-ledger', label: 'The Ledger' }];
    const names = new Map([['hollis', 'Hollis Vane']]);
    expect(refLabel('bible_doc:world/the-ledger', pages, names)).toBe('The Ledger');
    expect(refLabel('entity:hollis', pages, names)).toBe('Hollis Vane');
    expect(refLabel('thread:heir_mystery', pages, names)).toBe('Thread: Heir mystery');
    expect(refLabel('chapter:3', pages, names)).toBe('Chapter 3');
  });

  it('should never offer a page the writer cannot read, nor one already chosen', () => {
    const pages = [
      { ref: 'bible_doc:project/timeline', label: 'Timeline', writerExcluded: isWriterExcludedDoc('project', 'timeline') },
      { ref: 'entity:hollis', label: 'Hollis' },
      { ref: 'entity:tamsin', label: 'Tamsin' },
    ];
    expect(addablePages(pages, ['entity:hollis']).map(page => page.ref)).toEqual(['entity:tamsin']);
  });

  it('should offer only milestones this chapter can still claim', () => {
    const milestones = [
      { milestoneKey: 'a', label: 'A', state: 'open' as const, plannedChapter: null },
      { milestoneKey: 'b', label: 'B', state: 'planned' as const, plannedChapter: 4 },
      { milestoneKey: 'c', label: 'C', state: 'planned' as const, plannedChapter: 6 },
      { milestoneKey: 'd', label: 'D', state: 'reached' as const, plannedChapter: null },
    ];
    expect(claimableMilestones(milestones, 4, ['a']).map(milestone => milestone.milestoneKey)).toEqual(['b']);
  });
});

describe('createLatestQueue', () => {
  it('should send one edit at a time and only the latest of those made meanwhile', async () => {
    const sent: number[] = [];
    let release: () => void = () => undefined;
    const queue = createLatestQueue<number>(value => {
      sent.push(value);
      return value === 1 ? new Promise<void>(resolve => (release = resolve)) : Promise.resolve();
    });
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect(sent).toEqual([1]);
    release();
    expect(await queue.settled()).toBe(true);
    expect(sent).toEqual([1, 3]);
  });

  it('should report a failed last send and send it again on retry', async () => {
    const sent: number[] = [];
    let fail = true;
    const queue = createLatestQueue<number>(value => {
      sent.push(value);
      return fail ? Promise.reject(conflict('RFN_004')) : Promise.resolve();
    });
    queue.push(1);
    expect(await queue.settled()).toBe(false);
    fail = false;
    queue.retry();
    expect(await queue.settled()).toBe(true);
    expect(sent).toEqual([1, 1]);
  });
});

function flowWith(overrides: { send?: (value: number) => Promise<unknown>; apply?: () => Promise<unknown>; write?: () => Promise<string> } = {}) {
  const calls: string[] = [];
  const flow = createPlanFlow<number, string>({
    send: overrides.send ?? (value => (calls.push(`send ${value}`), Promise.resolve())),
    apply: overrides.apply ?? (() => (calls.push('apply'), Promise.resolve())),
    write: overrides.write ?? (() => (calls.push('write'), Promise.resolve('job'))),
  });
  return { flow, calls };
}

describe('createPlanFlow', () => {
  it('should apply only after the last edit is saved, then start writing', async () => {
    let release: () => void = () => undefined;
    const calls: string[] = [];
    const { flow } = flowWith({
      send: value => (calls.push(`send ${value}`), value === 1 ? new Promise<void>(resolve => (release = resolve)) : Promise.resolve()),
      apply: () => (calls.push('apply'), Promise.resolve()),
      write: () => (calls.push('write'), Promise.resolve('job')),
    });
    flow.change(1);
    flow.change(2);
    const outcome = flow.applyAndWrite();
    expect(calls).toEqual(['send 1']);
    release();
    expect(await outcome).toEqual({ kind: 'written', job: 'job' });
    expect(calls).toEqual(['send 1', 'send 2', 'apply', 'write']);
  });

  it('should send a failed edit again before applying, rather than applying the stale card', async () => {
    let failures = 1;
    const calls: string[] = [];
    const sends: number[] = [];
    const retrying = createPlanFlow<number, string>({
      send: value => (sends.push(value), failures-- > 0 ? Promise.reject(conflict('X')) : Promise.resolve()),
      apply: () => (calls.push('apply'), Promise.resolve()),
      write: () => Promise.resolve('job'),
    });
    retrying.change(7);
    expect((await retrying.applyAndWrite()).kind).toBe('written');
    expect(sends).toEqual([7, 7]);
    expect(calls).toEqual(['apply']);
  });

  it('should not apply when the edit still cannot be saved', async () => {
    const calls: string[] = [];
    const flow = createPlanFlow<number, string>({
      send: () => Promise.reject(conflict('X')),
      apply: () => (calls.push('apply'), Promise.resolve()),
      write: () => Promise.resolve('job'),
    });
    flow.change(1);
    expect(await flow.applyAndWrite()).toEqual({ kind: 'save-failed' });
    expect(calls).toEqual([]);
  });

  it('should refuse a second Write while the first is still waiting', async () => {
    let release: () => void = () => undefined;
    const { flow, calls } = flowWith({ send: () => new Promise<void>(resolve => (release = resolve)) });
    flow.change(1);
    const first = flow.applyAndWrite();
    expect(await flow.applyAndWrite()).toEqual({ kind: 'busy' });
    release();
    expect((await first).kind).toBe('written');
    expect(calls).toEqual(['apply', 'write']);
  });

  it('should report a refused apply and a failed start apart, and start writing again without applying twice', async () => {
    const refused = flowWith({ apply: () => Promise.reject(conflict('PLN_008')) });
    expect((await refused.flow.applyAndWrite()).kind).toBe('apply-failed');
    expect(refused.calls).toEqual([]);

    let fail = true;
    const { flow, calls } = flowWith({ write: () => (calls.push('write'), fail ? Promise.reject(conflict('DRF_010')) : Promise.resolve('job')) });
    expect((await flow.applyAndWrite()).kind).toBe('write-failed');
    fail = false;
    expect(await flow.writeAgain()).toEqual({ kind: 'written', job: 'job' });
    expect(calls).toEqual(['apply', 'write', 'write']);
  });
});
