import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlanCard, type PlanCardProps } from '../src/features/plan-card/PlanCard';
import { PlanStart, type PlanStartProps } from '../src/features/plan-card/PlanStart';
import { type ProposalResponse } from '../src/lib/apis/api-types.gen';
import { ApiError } from '../src/lib/apis/transport';
import { changeSetWith, findPlanOp, planDraftOf, type PlanOp } from '../src/lib/plan-card';

const OP: PlanOp = {
  op: 'brief.update',
  chapter: 4,
  title: 'What the ledger says',
  body: '',
  contextRefs: ['entity:hollis'],
  pov: 'tamsin',
  chapterPurpose: 'Tamsin learns the ledger lied about her.',
  readerValue: ['the empty Rook line'],
  scenes: [
    { summary: 'Hollis carries the tin box up.', pov: 'tamsin' },
    { summary: 'Hollis rehearses what he will say.', pov: 'hollis', goal: 'Stay silent' },
  ],
  claimedMilestones: ['empty_rook_line'],
  endingContract: { hookType: 'revelation', emotionalBeat: 'dread', openQuestion: 'Who hid her?', handoffState: 'Tamsin counts the years again.' },
  rationale: 'What the story owes now:\n- Can Tamsin trust Hollis?',
};

const POOLING =
  'Scene 2\'s point of view (Hollis) knows "The council paid for silence", which scene 1 (Tamsin) does not; the writer will have it for the whole chapter — split into two chapters, or keep it (a clue check will run).';

function proposal(overrides: Partial<ProposalResponse> = {}): ProposalResponse {
  return {
    id: 'p1',
    projectId: '3',
    scopeType: 'novel',
    kind: 'chapter_plan',
    status: 'pending',
    changeSet: [OP],
    baseline: {},
    autoApplied: false,
    revertible: false,
    warnings: [],
    diagnostics: [],
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}

const noop = (): void => undefined;

function card(overrides: Partial<PlanCardProps> = {}): string {
  const props: PlanCardProps = {
    proposal: proposal(),
    characters: [
      { entityKey: 'tamsin', name: 'Tamsin' },
      { entityKey: 'hollis', name: 'Hollis Vane' },
    ],
    milestones: [{ milestoneKey: 'empty_rook_line', label: 'Tamsin finds the empty Rook line', state: 'planned', plannedChapter: 4 }],
    pages: [{ ref: 'entity:hollis', label: 'Hollis Vane' }],
    kept: ['how the book ends', 'later volumes and their goals'],
    projectContentMode: 'standard',
    onChange: noop,
    onWrite: noop,
    onDiscard: noop,
    onAskForChanges: noop,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(PlanCard, props));
}

const conflict = (code: string, message = 'raw'): ApiError => new ApiError(409, { code, type: 'CONFLICT', message });

describe('PlanCard', () => {
  it('should show a loading state before the plan arrives', () => {
    expect(card({ proposal: undefined, loading: true })).toContain('Loading the plan');
  });

  it('should show an error with a way to try again', () => {
    const html = card({ proposal: undefined, error: new ApiError(500, { code: 'X', type: 'SERVER_ERROR', message: 'Backend down' }), onRetry: noop });
    expect(html).toContain('Couldn’t load the plan');
    expect(html).toContain('Backend down');
    expect(html).toContain('Try again');
  });

  it('should say so when the card holds no plan', () => {
    expect(card({ proposal: proposal({ changeSet: [{ op: 'entity.upsert' }] }) })).toContain('No chapter plan here');
  });

  it('should lay out every editable field with a label a screen reader reads, scenes as an ordered list', () => {
    const html = card();
    for (const label of ['Title', 'What this chapter does', 'Told mainly by', 'Ends on', 'Kind of ending', 'Beats · one per line']) expect(html).toContain(label);
    expect(html).toContain('value="What the ledger says"');
    expect(html).toMatch(/<ol aria-labelledby="[^"]+-scenes"/);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Scene 2 point of view"');
    expect(html).toContain('aria-label="Remove scene 1"');
    expect(html).toContain('Goal, obstacle and beats · 1 filled');
    expect(html).toContain('Milestone: Tamsin finds the empty Rook line');
    expect(html).toContain('Can Tamsin trust Hollis?');
    expect(html).toContain('Draft — edit anything');
  });

  it('should show the warnings a round-tripped edit returns, the pooling one prominently', () => {
    const before = proposal();
    const ref = findPlanOp(before)!;
    const edited = changeSetWith(before.changeSet, ref, { ...planDraftOf(ref.op), title: 'The empty line' });
    const after = card({
      proposal: proposal({ changeSet: edited, warnings: [POOLING, 'Density: 2 scene(s) for a 1800–2600 word chapter — keep it if that is what you intend.'] }),
    });
    expect(after).toContain('value="The empty line"');
    expect(after).toContain('role="note"');
    expect(after).toContain('Points of view know different things.');
    expect(after).toContain('Tell every scene from Tamsin');
    expect(after).toContain('Keep it — check the scenes for it');
    expect(after).toContain('Density: 2 scene(s)');
    expect(card()).not.toContain('Points of view know different things.');
  });

  it('should warn when a character who learns something no longer tells a scene', () => {
    const html = card({ proposal: proposal({ changeSet: [{ ...OP, knowledgeContract: { pov: ['tamsin'], learns: [{ entityKey: 'gull', factKey: 'rook_unpaid' }] } }] }) });
    expect(html).toContain('gull learns &quot;Rook unpaid&quot; on the page');
  });

  it('should offer the content mode as a radio group that follows the novel until the author picks', () => {
    const html = card({ projectContentMode: 'unrestricted' });
    expect(html).toMatch(/role="radiogroup"/);
    expect(html).toMatch(/role="radio" aria-checked="true" tabindex="0"[^>]*><span[^>]*>Unrestricted/);
    expect(html).toMatch(/role="radio" aria-checked="false" tabindex="-1"/);
    expect(html).toContain('Following the novel’s setting until you pick one for this chapter.');
    expect(html).toContain('walled off');
  });

  it('should show the mode the chapter already has on a replan, with a way back to the novel’s', () => {
    const html = card({ chapterContentMode: 'unrestricted' });
    expect(html).toMatch(/aria-checked="true"[^>]*><span[^>]*>Unrestricted/);
    expect(html).toContain('Follow the novel’s setting (Standard)');
  });

  it('should show the author’s own choice once it is on the card', () => {
    const html = card({ proposal: proposal({ changeSet: [{ ...OP, contentMode: 'standard' }] }), projectContentMode: 'unrestricted', chapterContentMode: 'unrestricted' });
    expect(html).toMatch(/aria-checked="true"[^>]*><span[^>]*>Standard/);
    expect(html).not.toContain('walled off');
  });

  it('should show what the writer gets and the fixed lines kept from it', () => {
    const html = card();
    expect(html).toContain('What the writer gets');
    expect(html).toContain('aria-label="Remove Hollis Vane"');
    expect(html).toContain('Kept from the writer:</b> how the book ends, later volumes and their goals.');
    expect(html).toContain('The Writer’s view shows exactly what was sent.');
  });

  it('should offer Write, Ask for changes and Discard on a pending plan, with the canvas hint', () => {
    const html = card();
    expect(html).toContain('Write chapter 4');
    expect(html).toContain('Usually a few minutes — you can leave');
    expect(html).toContain('Ask for changes');
    expect(html).toContain('Discard');
  });

  it('should hold a plan back from writing until it has a title and a scene, and mark one that started empty', () => {
    const html = card({ proposal: proposal({ changeSet: [{ op: 'brief.update', chapter: 5, title: 'Only a title', body: '', scenes: [], claimedMilestones: [] }] }) });
    expect(html).toContain('Your plan — nothing filled in for you');
    expect(html).toContain('Give it a title and at least one scene first');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Write chapter 5/);
    expect(html).toContain('No scenes yet.');
  });

  it('should lock a plan that was already used, without actions', () => {
    const html = card({ proposal: proposal({ status: 'applied' }) });
    expect(html).toContain('Plan saved');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).not.toContain('Write chapter 4');
  });

  it('should say when the plan was saved but writing did not start, with a retry where one helps', () => {
    const html = card({ proposal: proposal({ status: 'applied' }), writeFailure: { message: 'Another chapter is being written.', retry: true }, onRetryWrite: noop });
    expect(html).toContain('Plan saved — writing didn’t start');
    expect(html).toContain('Another chapter is being written.');
    expect(html).toContain('Try again');
    expect(card({ writeFailure: { message: 'Approve chapter 3 first.', retry: false }, onRetryWrite: noop })).not.toContain('Try again');
  });

  it('should offer a new plan when the story moved past this one', () => {
    const html = card({ applyError: conflict('PLN_008'), onPlanAgain: noop });
    expect(html).toContain('The story has moved on');
    expect(html).toContain('Plan the next chapter');
  });

  it('should offer to drop a refused reveal only when the plan really makes it', () => {
    const refused = conflict('PLN_001', 'The plan for chapter 4 reveals facts that are still locked there: rook_unpaid (needs lamp_rank_3)');
    const revealing = proposal({ changeSet: [{ ...OP, knowledgeContract: { pov: ['tamsin', 'hollis'], learns: [{ entityKey: 'tamsin', factKey: 'rook_unpaid' }] } }] });
    const html = card({ proposal: revealing, applyError: refused });
    expect(html).toContain('A reveal in this plan isn’t unlocked here');
    expect(html).toContain('Drop the reveal');
    expect(card({ applyError: refused })).not.toContain('Drop the reveal');
  });

  it('should let a failed save be tried again', () => {
    const html = card({ saveError: conflict('RFN_004', 'Change-set operation not allowed'), onRetrySave: noop });
    expect(html).toContain('Couldn’t save the plan');
    expect(html).toContain('Try again');
  });

  it('should say when an edit is being saved, without re-announcing the ending on each key', () => {
    expect(card({ saving: true })).toContain('Saving…');
    const partial = card({ proposal: proposal({ changeSet: [{ ...OP, endingContract: undefined }] }) });
    expect(partial).not.toContain('still missing');
    expect(card().match(/role="status"/g)).toHaveLength(1);
  });

  it('should take the canvas indent only when asked', () => {
    expect(card({ indent: true })).toContain('data-indent="true"');
    expect(card()).not.toContain('data-indent');
  });
});

function start(overrides: Partial<PlanStartProps> = {}): string {
  const props: PlanStartProps = { chapter: 4, onPlanFromIntent: noop, onEmptyPlan: noop, onWriteMyself: noop, ...overrides };
  return renderToStaticMarkup(createElement(PlanStart, props));
}

describe('PlanStart', () => {
  it('should offer the author’s own paths even with no directions', () => {
    const html = start();
    expect(html).toContain('I know what happens');
    expect(html).toContain('Write the plan myself');
    expect(html).toContain('Write it myself');
    expect(html).not.toContain('Ways chapter 4 could go');
    expect(html.match(/<button type="button"/g)).toHaveLength(3);
  });

  it('should list the chat’s directions as choices with what each pays and costs', () => {
    const html = start({
      directions: [{ key: 'a', title: 'Hollis opens the ledger', what: 'She sees the empty line.', pays: '1 and 3', costs: 'Low Harrow waits' }],
      picked: 'a',
      onPickDirection: noop,
    });
    expect(html).toContain('Ways chapter 4 could go');
    expect(html).toContain('Option A');
    expect(html).toContain('Pays off: 1 and 3');
    expect(html).toContain('Costs: Low Harrow waits');
    expect(html).toContain('aria-pressed="true"');
  });

  it('should wait on every path while a plan is starting', () => {
    expect(start({ busy: true }).match(/disabled=""/g)).toHaveLength(3);
  });
});
