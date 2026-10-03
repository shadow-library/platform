import { describe, expect, it } from 'bun:test';
import { textDigest } from '@shadow-library/sdk';

import {
  answeredInPanel,
  appliedRows,
  applyNoteToast,
  awaitingAnswer,
  checklistView,
  commitBarView,
  COMPOSER_MODES,
  composerChips,
  composerModeChange,
  composerModeOf,
  entryNotes,
  finalizeReviewBlocked,
  finalizeReviewChapter,
  heroText,
  isActionOp,
  isProgressItemKey,
  jobKindForOp,
  jobView,
  lastUserOrdinal,
  mergeUndoImpacts,
  notesOpenerId,
  offersNotes,
  opCardTitle,
  openerChip,
  opEyebrow,
  opSubject,
  opTopicLabel,
  opTouchesRecord,
  opWrittenText,
  opWrittenValue,
  organiseReceiptView,
  pendingDecisionLabel,
  picksOf,
  picksSentence,
  promptChips,
  proposalPresentation,
  questionEyebrow,
  questionOf,
  rationaleOf,
  rejectionScopeNote,
  rejectionScopesFor,
  rejectionWhy,
  RETIRES_NOTE,
  rowSource,
  shouldRefocusComposer,
  SUGGESTED_EYEBROW,
  suggestionCommit,
  turnAnnouncement,
  turnCardsInline,
  unansweredWarning,
  undoImpactView,
  unusedParagraphPrompt,
} from '../src/features/chat/chat-view';
import { type ChatMessageResponse, type ChatTurnResponse, type ProposalResponse } from '../src/lib/apis/api-types.gen';
import { type ChatJobState, type OrganiseReceipt } from '../src/lib/apis/chat.api';

const COUNCIL = { op: 'entity.upsert', entityKey: 'council', type: 'faction', name: 'The Tidewarden’s council', body: 'The families who grew rich trading memories.' };

describe('opWrittenValue', () => {
  it('should show the written value beside the name, since a quote alone cannot prove the value is faithful', () => {
    expect(opWrittenValue(COUNCIL)).toBe('The Tidewarden’s council: The families who grew rich trading memories.');
  });

  it('should show a volume goal under its title', () => {
    expect(opWrittenValue({ op: 'volume.upsert', volumeKey: 'v1', title: 'The Ledger', objective: 'Tamsin learns why she never paid' })).toBe(
      'The Ledger: Tamsin learns why she never paid',
    );
  });

  it('should fall back to the subject when the op writes no text', () => {
    expect(opWrittenValue({ op: 'milestone.upsert', milestoneKey: 'rank-3' })).toBe('rank-3');
  });
});

describe('bible document ops', () => {
  const doc = { op: 'bible_document.upsert', section: 'project', slug: 'default', frontmatter: { title: 'Project' }, body: '# Heading\n\n**bold**' };

  it('should title the card with the document title instead of the slug', () => {
    expect(opSubject(doc)).toBe('Project');
  });

  it('should fall back to the slug when the document has no title', () => {
    expect(opSubject({ ...doc, frontmatter: { title: '  ' } })).toBe('default');
    expect(opSubject({ ...doc, frontmatter: undefined })).toBe('default');
  });

  it('should return the written value alone without the subject prefix', () => {
    expect(opWrittenText(doc)).toBe('# Heading\n\n**bold**');
    expect(opWrittenText({ op: 'milestone.upsert', milestoneKey: 'rank-3' })).toBe('rank-3');
  });

  it('should join topic and subject in the card title unless they are the same', () => {
    expect(opCardTitle({ op: 'premise.update', premise: 'x' })).toBe('The story: Premise');
    expect(opCardTitle({ op: 'premise.update', opposition: 'The campus itself' })).toBe('The story: Opposition');
    expect(opCardTitle({ op: 'premise.update', premise: 'x', theme: 'y', readerPromise: 'z' })).toBe('The story: Premise, Theme, Reader promise');
    expect(opCardTitle({ op: 'bible_document.upsert', section: 'project', slug: 'story-core', frontmatter: { title: 'Story core' } })).toBe('Story core');
  });
});

describe('opEyebrow', () => {
  const op = (rationale?: string) => ({ op: 'premise.update', premise: 'x', rationale });

  it('should cite the note paragraphs in the rationale compactly', () => {
    expect(opEyebrow(op('Organises the setting from notes ¶1, ¶4 and ¶13.'))).toBe('From your notes · ¶1, ¶4, ¶13');
  });

  it('should keep a paragraph range as written', () => {
    expect(opEyebrow(op('Draws on ¶4–¶10 of your notes.'))).toBe('From your notes · ¶4–¶10');
  });

  it('should stay suggested when the rationale cites no paragraph', () => {
    expect(opEyebrow(op('A fitting ¶ mark, nothing more.'))).toBe(SUGGESTED_EYEBROW);
    expect(opEyebrow(op())).toBe(SUGGESTED_EYEBROW);
  });
});

describe('opTopicLabel', () => {
  it('should file ops under the Story Bible topic they land in', () => {
    expect(opTopicLabel({ op: 'premise.update', premise: 'x' })).toBe('The story');
    expect(opTopicLabel({ op: 'entity.upsert', type: 'character' })).toBe('People');
    expect(opTopicLabel({ op: 'entity.upsert', type: 'location' })).toBe('Places');
    expect(opTopicLabel({ op: 'fact.upsert', factKey: 'k', unlock: { milestones: ['m'] } })).toBe('Secrets');
    expect(opTopicLabel({ op: 'fact.upsert', factKey: 'k' })).toBe('Facts');
    expect(opTopicLabel({ op: 'organise.rule', rule: 'No magic at sea', optionId: 'r1' })).toBe('Notebook');
  });
});

describe('appliedRows + rowSource', () => {
  it('should keep each op’s quote and name where it came from', () => {
    const [row] = appliedRows([{ ...COUNCIL, quote: 'the families who grew rich' }]);
    expect(row).toMatchObject({ topic: 'Factions & peoples', quote: 'the families who grew rich' });
    expect(rowSource(row!, 'message')).toBe('from your message: “the families who grew rich”');
  });

  it('should cite note paragraphs for an organise row', () => {
    const [row] = appliedRows([COUNCIL], new Map([[0, [4, 6]]]));
    expect(rowSource(row!, 'notes')).toBe('from your notes, ¶4, ¶6');
    expect(rowSource(row!, 'message')).toBeUndefined();
  });
});

describe('undoImpactView', () => {
  it('should say nothing relies on a change with no dependents', () => {
    expect(undoImpactView({ proposalId: 'p', dependents: [], finalUnaffected: 0 }).empty).toBe(true);
  });

  it('should count dependents by kind and name the final chapters left alone', () => {
    const view = undoImpactView({
      proposalId: 'p',
      dependents: [
        { kind: 'plan', ref: 'chapter:4', because: 'entity:council', final: false },
        { kind: 'knowledge', ref: 'knowledge:tamsin/debt', because: 'fact:debt', final: false },
        { kind: 'knowledge', ref: 'knowledge:hollis/debt', because: 'fact:debt', final: true },
        { kind: 'suggestion', ref: 'proposal:9', because: 'entity:council', final: false },
      ],
      finalUnaffected: 2,
    });
    expect(view.counts).toEqual(['1 chapter plan', '2 things characters know', '1 waiting suggestion']);
    expect(view.finalNote).toBe('2 final chapters and plans also rely on it and stay as they are.');
    expect(view.empty).toBe(false);
  });
});

describe('suggestionCommit', () => {
  it('should wait until every suggestion has an answer', () => {
    expect(suggestionCommit(2, new Map([[0, 'add']]))).toEqual({ kind: 'wait' });
  });

  it('should apply the added ops and discard when none were added', () => {
    expect(
      suggestionCommit(
        2,
        new Map([
          [1, 'add'],
          [0, 'decline'],
        ]),
      ),
    ).toEqual({ kind: 'apply', opIndexes: [1] });
    expect(suggestionCommit(1, new Map([[0, 'decline']]))).toEqual({ kind: 'discard' });
  });

  it('should apply the picked ones early when asked, but never discard what is still undecided', () => {
    expect(suggestionCommit(3, new Map([[2, 'add']]), true)).toEqual({ kind: 'apply', opIndexes: [2] });
    expect(suggestionCommit(3, new Map([[2, 'decline']]), true)).toEqual({ kind: 'wait' });
  });
});

describe('isActionOp', () => {
  it('should recognise any op that starts an action rather than proposing an idea', () => {
    expect(isActionOp({ op: 'action.organise_notes' })).toBe(true);
    expect(isActionOp({ op: 'action.plan_chapter' })).toBe(true);
    expect(isActionOp(COUNCIL)).toBe(false);
  });
});

describe('rejectionScopesFor', () => {
  it('should offer "not this version" for an op that touches a record', () => {
    expect(rejectionScopesFor(COUNCIL)).toEqual(['never', 'not_now', 'not_this_version']);
  });

  it('should leave it out for a rule, which the server refuses to scope that way (LDG_008)', () => {
    expect(opTouchesRecord({ op: 'organise.rule', rule: 'No magic at sea' })).toBe(false);
    expect(rejectionScopesFor({ op: 'organise.rule', rule: 'No magic at sea' })).toEqual(['never', 'not_now']);
  });

  it('should offer no scopes at all for an action — it is run or not, never remembered as an idea (LDG_007)', () => {
    expect(opTouchesRecord({ op: 'action.organise_notes' })).toBe(false);
    expect(rejectionScopesFor({ op: 'action.organise_notes' })).toEqual([]);
    expect(rejectionScopesFor({ op: 'action.plan_chapter' })).toEqual([]);
  });
});

describe('rejectionScopeNote + rejectionWhy', () => {
  it('should read each scope back as a sentence fragment and a Notebook reason', () => {
    expect(rejectionScopeNote('never')).toBe('for this story');
    expect(rejectionScopeNote('not_now')).toBe('for now');
    expect(rejectionScopeNote('not_this_version')).toBe('for this version');
    expect(rejectionWhy('never')).toContain('not for this story');
    expect(rejectionWhy('not_now')).toContain('may fit later');
    expect(rejectionWhy('not_this_version')).toContain('eligible again');
  });
});

describe('finalizeReviewBlocked + finalizeReviewChapter', () => {
  const finalize = { op: 'action.finalize' };

  it('should recognise only a finalize action refused for a review reason', () => {
    expect(finalizeReviewBlocked(finalize, 'FRV_002')).toBe(true);
    expect(finalizeReviewBlocked(finalize, 'FRV_006')).toBe(true);
    expect(finalizeReviewBlocked(finalize, 'FRV_001')).toBe(false);
    expect(finalizeReviewBlocked({ op: 'action.approve_draft' }, 'FRV_002')).toBe(false);
  });

  it('should read the chapter off the action when it named one, and leave it unknown otherwise', () => {
    expect(finalizeReviewChapter({ op: 'action.finalize', upTo: 5 })).toBe(5);
    expect(finalizeReviewChapter(finalize)).toBeUndefined();
  });
});

describe('proposalPresentation', () => {
  it('should route a proposal to the view that fits it', () => {
    expect(proposalPresentation({ kind: 'chapter_plan', status: 'pending', changeSet: [] })).toBe('plan');
    expect(proposalPresentation({ kind: 'hub', status: 'pending', changeSet: [COUNCIL] })).toBe('suggestions');
    expect(proposalPresentation({ kind: 'hub', status: 'pending', changeSet: [{ op: 'action.finalize' }] })).toBe('legacy');
    expect(proposalPresentation({ kind: 'hub', status: 'applied', changeSet: [COUNCIL] })).toBe('applied');
    expect(proposalPresentation({ kind: 'hub', status: 'reverted', changeSet: [COUNCIL] })).toBe('reverted');
    expect(proposalPresentation({ kind: 'hub', status: 'discarded', changeSet: [COUNCIL] })).toBe('passed');
    expect(proposalPresentation({ kind: 'hub', status: 'conflicted', changeSet: [COUNCIL] })).toBe('legacy');
    expect(proposalPresentation({ kind: 'hub', status: 'pending', changeSet: [COUNCIL, { op: 'action.advance_volume' }] })).toBe('legacy');
  });
});

describe('answeredInPanel', () => {
  it('should answer Story Bible suggestions in the panel, settled or not', () => {
    expect(answeredInPanel({ kind: 'chat', changeSet: [COUNCIL, { op: 'milestone.upsert', milestoneKey: 'm1' }] })).toBe(true);
  });

  it('should keep every action, prose, plan edits and plans on their own card in the thread', () => {
    const ops = ['action.finalize', 'action.approve_draft', 'action.generate_chapter', 'action.advance_volume', 'action.organise_notes', 'action.plan_chapter'];
    for (const op of [...ops, 'action.audit_bible', 'draft.update', 'draft.remove', 'action.revise_draft', 'brief.update'])
      expect(answeredInPanel({ kind: 'chat', changeSet: [COUNCIL, { op }] })).toBe(false);
    expect(answeredInPanel({ kind: 'chapter_plan', changeSet: [] })).toBe(false);
  });
});

describe('turnCardsInline', () => {
  it('should mount a turn’s cards in the thread only when they need their own card, or failed to load', () => {
    expect(turnCardsInline({ kind: 'chat', changeSet: [COUNCIL] }, false)).toBe(false);
    expect(turnCardsInline({ kind: 'chat', changeSet: [COUNCIL, { op: 'action.finalize' }] }, false)).toBe(true);
    expect(turnCardsInline({ kind: 'chat', changeSet: [{ op: 'draft.update', chapter: 2 }] }, false)).toBe(true);
    expect(turnCardsInline({ kind: 'chapter_plan', changeSet: [] }, false)).toBe(false);
    expect(turnCardsInline(undefined, true)).toBe(false);
    expect(turnCardsInline(undefined, false)).toBe(true);
  });
});

describe('mergeUndoImpacts', () => {
  it('should list each dependent once and count every final chapter left as it is', () => {
    const plan = { kind: 'plan' as const, ref: 'chapter:3', because: 'entity:tamsin', final: false };
    const draft = { kind: 'draft' as const, ref: 'draft:3', because: 'entity:tamsin', final: false };
    expect(
      mergeUndoImpacts([
        { proposalId: 'cp', dependents: [plan], finalUnaffected: 1 },
        { proposalId: 'ap', dependents: [plan, draft], finalUnaffected: 2 },
      ]),
    ).toEqual({ proposalId: 'cp', dependents: [plan, draft], finalUnaffected: 3 });
    expect(mergeUndoImpacts([])).toBeUndefined();
  });
});

describe('applyNoteToast', () => {
  const reply = (extra: Partial<ChatMessageResponse> = {}): ChatMessageResponse => ({
    id: 'a1',
    sessionId: 's',
    ordinal: 2,
    role: 'assistant',
    content: 'Done.',
    createdAt: '2026-10-02T10:00:00.000Z',
    ...extra,
  });
  const cards = (changeSet: ProposalResponse['changeSet']): ProposalResponse => ({ id: 'cp', kind: 'chat', status: 'pending', changeSet }) as ProposalResponse;
  const turn = (extra: Partial<ChatTurnResponse>): ChatTurnResponse =>
    ({ userMessage: reply({ role: 'user' }), assistantMessage: reply(), runId: 'r', ...extra }) as ChatTurnResponse;

  it('should leave a hold on panel cards to the receipt', () => {
    expect(applyNoteToast(turn({ applyNote: 'Held.', held: 'planner_sources', proposal: cards([COUNCIL]) }))).toBeUndefined();
    expect(
      applyNoteToast(turn({ applyNote: 'Held.', held: 'warnings', proposal: cards([COUNCIL]), appliedProposal: cards([]), assistantMessage: reply({ appliedProposalId: 'ap' }) })),
    ).toBeUndefined();
  });

  it('should still toast a note the receipt cannot carry', () => {
    expect(applyNoteToast(turn({ applyNote: 'Could not apply.' }))).toBe('Could not apply.');
    expect(applyNoteToast(turn({ applyNote: 'Held. Not linked.', held: 'planner_sources', proposal: cards([COUNCIL]), appliedProposal: cards([]) }))).toBe('Held. Not linked.');
    expect(applyNoteToast(turn({ applyNote: 'Held.', held: 'warnings', proposal: cards([COUNCIL, { op: 'action.finalize' }]) }))).toBe('Held.');
    expect(applyNoteToast(turn({}))).toBeUndefined();
  });
});

describe('checklistView', () => {
  const items = [
    { key: 'premise', label: 'Premise', why: 'Everything hangs on it', status: 'answered' as const },
    { key: 'ending', label: 'How it ends', why: 'Aim the volumes', status: 'undecided' as const },
    { key: 'opposition', label: 'Who opposes her', why: 'Conflict', status: 'open' as const },
    { key: 'theme', label: 'Theme', why: 'Depth', status: 'dismissed' as const },
  ];

  it('should count undecided as answered and leave dismissed items out', () => {
    const view = checklistView(items);
    expect(view.title).toBe('Story so far');
    expect(view.items.map(item => item.key)).toEqual(['premise', 'ending', 'opposition']);
    expect(view.answered).toBe(2);
    expect(view.percent).toBe(67);
    expect(view.dismissed).toBe(1);
    expect(view.complete).toBe(false);
  });
});

describe('questionEyebrow', () => {
  const items = [
    { key: 'premise', label: 'Premise', why: 'Everything hangs on it', status: 'answered' as const },
    { key: 'ending', label: 'How it ends', why: 'Aim the volumes', status: 'undecided' as const },
    { key: 'opposition', label: 'Who opposes her', why: 'Conflict', status: 'open' as const },
    { key: 'theme', label: 'Theme', why: 'Depth', status: 'dismissed' as const },
    { key: 'protagonist', label: 'Protagonist', why: 'Lead', status: 'open' as const },
  ];
  const checklist = checklistView(items);

  it('should name the topic without counting questions, whatever the item’s state', () => {
    expect(questionEyebrow('opposition', checklist)).toBe('Who opposes her');
    expect(questionEyebrow('premise', checklist)).toBe('Premise');
    expect(questionEyebrow('ending', checklist)).toBe('How it ends');
  });

  it('should be just “Question” without a progress key, a checklist, or a matching item', () => {
    expect(questionEyebrow(undefined, checklist)).toBe('Question');
    expect(questionEyebrow(null, checklist)).toBe('Question');
    expect(questionEyebrow('opposition', undefined)).toBe('Question');
    expect(questionEyebrow('first_volume_goal', checklist)).toBe('Question');
    expect(questionEyebrow('theme', checklist)).toBe('Question');
  });
});

describe('lastUserOrdinal', () => {
  it('should find the author’s last message, which settles every question asked before it', () => {
    const messages = [
      { role: 'assistant', ordinal: 2 },
      { role: 'user', ordinal: 3 },
      { role: 'assistant', ordinal: 4 },
    ];
    expect(lastUserOrdinal(messages)).toBe(3);
    expect(lastUserOrdinal([])).toBe(0);
  });
});

describe('questionOf', () => {
  const structured = {
    question: 'Who opposes her?',
    why: null,
    answers: [
      { title: 'The council', tradeOff: 'spends the villain early', recommended: true },
      { title: 'Her mother', why: null },
    ],
    progressKey: 'opposition',
  };

  it('should draw the server’s question with its answers, trade-offs and recommendation', () => {
    expect(questionOf(structured)).toEqual({
      question: 'Who opposes her?',
      why: undefined,
      options: [
        { title: 'The council', why: undefined, tradeOff: 'spends the villain early', recommended: true },
        { title: 'Her mother', why: undefined, tradeOff: undefined, recommended: false },
      ],
      progressKey: 'opposition',
    });
    expect(questionOf(null)).toBeUndefined();
    expect(questionOf({ ...structured, answers: [] })).toBeUndefined();
  });

  it('should drop a progress key the checklist does not know, so it never reaches a URL', () => {
    expect(questionOf({ ...structured, progressKey: '../../etc' })?.progressKey).toBeUndefined();
    expect(isProgressItemKey('ending')).toBe(true);
    expect(isProgressItemKey('ending/../x')).toBe(false);
  });
});

function job(overrides: Partial<ChatJobState>): ChatJobState {
  return { id: 'j', kind: 'plan', status: 'in_progress', progress: { current: '4', phase: 'planning' }, retrying: false, seq: 1, firstSeq: 1, ...overrides };
}

describe('jobView', () => {
  it('should name a running job and its phase, and let it be cancelled', () => {
    expect(jobView(job({}))).toEqual({ title: 'Planning chapter 4…', detail: 'Drafting the plan', tone: 'running', cancellable: true });
  });

  it('should say a queued job starts soon and a retrying one tries again', () => {
    expect(jobView(job({ status: 'pending' })).detail).toBe('Queued — starts in a moment.');
    expect(jobView(job({ retrying: true })).detail).toBe('It timed out; trying once more.');
  });

  it('should report how a job ended', () => {
    expect(jobView(job({ status: 'done', kind: 'organise', progress: { proposalId: 'p1' } }))).toMatchObject({
      title: 'Read your notes and organised them',
      tone: 'done',
      proposalId: 'p1',
    });
    expect(jobView(job({ status: 'failed', error: 'Gateway timed out' }))).toMatchObject({ tone: 'failed', detail: 'Gateway timed out', cancellable: false });
    expect(jobView(job({ status: 'cancelled' })).title).toBe('Planning chapter 4 — cancelled');
  });

  it('should name the chapter a Story Bible refresh read, and hand over its card', () => {
    expect(jobView(job({ kind: 'canon_refresh', progress: { current: '5', phase: 'refreshing' } }))).toMatchObject({
      title: 'Checking the Story Bible against chapter 5…',
      detail: 'Reading what the chapter changed',
    });
    expect(jobView(job({ kind: 'canon_refresh', status: 'pending', progress: {} })).title).toBe('Checking the Story Bible against the new chapter…');
    expect(jobView(job({ kind: 'canon_refresh', status: 'done', progress: { current: '5', proposalId: 'p9' } }))).toMatchObject({
      title: 'Checked the Story Bible against chapter 5',
      proposalId: 'p9',
    });
  });

  it('should say a Story Bible refresh that found nothing left nothing to review', () => {
    expect(jobView(job({ kind: 'canon_refresh', status: 'done', progress: { current: '5', phase: 'unchanged' } }))).toEqual({
      title: 'Checked the Story Bible against chapter 5',
      detail: 'Nothing on your pages needs updating.',
      tone: 'done',
      cancellable: false,
    });
  });
});

describe('jobKindForOp', () => {
  it('should map an action op to the job it starts', () => {
    expect(jobKindForOp({ op: 'action.plan_chapter' })).toBe('plan');
    expect(jobKindForOp({ op: 'action.organise_notes' })).toBe('organise');
  });
});

describe('shouldRefocusComposer', () => {
  it('should return focus to the composer when it was lost to the page or stayed inside the composer', () => {
    const body = { contains: () => false } as unknown as Element;
    const inside = {} as Element;
    const composer = { contains: (node: Element) => node === inside } as unknown as Element;
    expect(shouldRefocusComposer(null, composer, body)).toBe(true);
    expect(shouldRefocusComposer(body, composer, body)).toBe(true);
    expect(shouldRefocusComposer(inside, composer, body)).toBe(true);
    expect(shouldRefocusComposer({} as Element, composer, body)).toBe(false);
  });
});

describe('turnAnnouncement', () => {
  it('should announce what the turn did once', () => {
    expect(turnAnnouncement({ applied: 2, suggested: 1, failed: false })).toBe('Forge replied. 2 changes added from your words. 1 suggestion waits for you.');
    expect(turnAnnouncement({ applied: 0, suggested: 0, failed: false })).toBe('Forge replied.');
    expect(turnAnnouncement({ applied: 0, suggested: 0, failed: true })).toBe('Forge couldn’t finish that reply.');
  });
});

describe('notesOpenerId', () => {
  const user = (id: string, content: string) => ({ id, role: 'user', content });

  it('should carry the notes on a chat that opened by handing them over, under any opener past or present', () => {
    expect(notesOpenerId([user('m1', 'Here are my notes for the story. Organise them into my Story Bible as the world stands when the story opens.')])).toBe('m1');
    expect(notesOpenerId([user('m1', 'Organise my notes and ask me about the rest')])).toBe('m1');
  });

  it('should never carry them on a chat that opened with anything else, even when a later message mentions the notes', () => {
    expect(notesOpenerId([user('m1', 'Give me a few ideas for chapter 1, from where the story stands.'), user('m3', 'Organise my notes')])).toBeUndefined();
    expect(notesOpenerId([])).toBeUndefined();
  });
});

describe('promptChips + openerChip', () => {
  it('should lead with ideas for the next chapter, then planning it, and never press for checklist answers', () => {
    expect(promptChips(3)).toEqual([
      { label: 'Ideas for chapter 3', prompt: 'Give me a few ideas for chapter 3, from where the story stands.' },
      { label: 'Plan chapter 3', prompt: 'Let’s plan chapter 3.' },
    ]);
  });

  it('should offer the opener only on an empty new-novel chat with notes', () => {
    expect(openerChip('new_novel', 0, 'notes')?.label).toBe('Organise my notes');
    expect(openerChip('new_novel', 2, 'notes')).toBeUndefined();
    expect(openerChip('new_novel', 0, '  ')).toBeUndefined();
    expect(openerChip('source', 0, 'notes')).toBeUndefined();
  });
});

describe('offersNotes', () => {
  it('should offer only on the author’s own messages the server flagged', () => {
    expect(offersNotes({ role: 'user', offersNotes: true })).toBe(true);
    expect(offersNotes({ role: 'assistant', offersNotes: true })).toBe(false);
    expect(offersNotes({ role: 'user' })).toBe(false);
  });
});

describe('organiseReceiptView', () => {
  const notes = 'The sea refuses a payment.\n\nmaybe the lamp remembers every keeper?\n\nboat names: Gull’s Due';
  const receipt: OrganiseReceipt = {
    notesDigest: textDigest(notes),
    paragraphs: 3,
    unusedParagraphs: [2, 3],
    fromNotes: 4,
    suggested: 1,
    rules: 0,
    applied: [],
    card: [
      { opIndex: 0, label: 'rule', paragraphs: [1] },
      { opIndex: 1, label: 'suggested', paragraphs: [] },
    ],
  };

  it('should list the unused paragraphs with their text while the notes are unchanged', () => {
    const view = organiseReceiptView(receipt, notes);
    expect(view.summary).toBe('4 entries from your notes · 1 suggestion — read from 3 paragraphs');
    expect(view.unused).toEqual([
      { number: 2, text: 'maybe the lamp remembers every keeper?' },
      { number: 3, text: 'boat names: Gull’s Due' },
    ]);
    expect(view.renumbered).toBe(false);
  });

  it('should keep only the numbers once the notes have changed', () => {
    const view = organiseReceiptView(receipt, `${notes}\n\nA new paragraph`);
    expect(view.renumbered).toBe(true);
    expect(view.unused).toEqual([{ number: 2 }, { number: 3 }]);
  });

  it('should label each card op by where it came from', () => {
    expect([...entryNotes(receipt.card).values()]).toEqual([
      { eyebrow: 'A rule from your notes', retires: false },
      { eyebrow: 'Suggested — not in your notes', retires: false },
    ]);
    expect(entryNotes([{ opIndex: 0, label: 'suggested', paragraphs: [], retires: ['e1'] }]).get(0)?.retires).toBe(true);
  });

  it('should turn an unused paragraph into the author’s own words for the chat', () => {
    expect(unusedParagraphPrompt({ number: 2, text: 'maybe the lamp remembers' })).toBe('Add this from my notes (¶2) to the Story Bible: maybe the lamp remembers');
  });
});

describe('answering a card', () => {
  it('should say what will happen before the card commits', () => {
    expect(pendingDecisionLabel('The council', 'People', 2, false)).toBe('Will add “The council” to People — 2 left to answer.');
    expect(pendingDecisionLabel('The council', 'People', 0, true)).toBe('Will add “The council” to People — adding now.');
    expect(pendingDecisionLabel('The council', 'People', 0, false)).toBe('Will add “The council” to People.');
    expect(unansweredWarning(1)).toBe('1 suggestion still needs an answer — nothing on that card is added until you answer the rest or add the picked ones now.');
  });

  it('should list what had been picked on a replaced card', () => {
    const picks = picksOf(
      [COUNCIL, { op: 'entity.upsert', entityKey: 'maren', type: 'character', name: 'Maren' }],
      new Map([
        [1, 'decline'],
        [0, 'add'],
      ]),
    );
    expect(picksSentence(picks)).toBe('You had picked: add “The Tidewarden’s council”, not “Maren”.');
    expect(picksSentence([])).toBe('You had not answered any of it yet.');
  });

  it('should say the retire note once, from the receipt rather than the rationale', () => {
    expect(rationaleOf({ op: 'organise.rule', rationale: `A rule from your notes (¶2). ${RETIRES_NOTE}` })).toBe('A rule from your notes (¶2).');
  });
});

describe('appliedRows', () => {
  it('should leave actions out: a started job reports itself', () => {
    expect(appliedRows([COUNCIL, { op: 'action.plan_chapter', chapter: 4 }]).map(row => row.index)).toEqual([0]);
  });
});

describe('mode copy', () => {
  it('should describe a manual chat as it behaves', () => {
    expect(heroText('The Tide Ledger', 'manual')).toContain('every change waits for your yes');
  });
});

describe('composer mode', () => {
  it('should offer the three modes with a one-line description each', () => {
    expect(COMPOSER_MODES.map(mode => mode.label)).toEqual(['Edit freely', 'Ask first', 'Just discuss']);
    expect(COMPOSER_MODES.map(mode => mode.description)).toEqual([
      'Applies most Story Bible changes right away. Removals, plans, prose and secrets still ask. Undo any time.',
      'Suggests every change. You approve each one.',
      'Nothing changes until you approve it.',
    ]);
  });

  it('should read the current mode from the chat and the per-turn discuss flag, discuss winning', () => {
    expect(composerModeOf('auto', false)).toBe('edit-freely');
    expect(composerModeOf('manual', false)).toBe('ask-first');
    expect(composerModeOf('auto', true)).toBe('just-discuss');
    expect(composerModeOf('manual', true)).toBe('just-discuss');
  });

  it('should save a session mode only when the pick changes it, and never for Just discuss', () => {
    expect(composerModeChange('ask-first', 'auto')).toEqual({ justDiscussing: false, sessionMode: 'manual' });
    expect(composerModeChange('edit-freely', 'manual')).toEqual({ justDiscussing: false, sessionMode: 'auto' });
    expect(composerModeChange('edit-freely', 'auto')).toEqual({ justDiscussing: false, sessionMode: undefined });
    expect(composerModeChange('just-discuss', 'manual')).toEqual({ justDiscussing: true });
  });
});

describe('composerChips', () => {
  const chips = [{ label: 'Plan chapter 1', prompt: 'Let’s plan chapter 1.' }];

  it('should hide the static chips while a turn runs or a question waits, and keep them otherwise', () => {
    expect(composerChips(chips, { running: true, awaitingAnswer: false })).toEqual([]);
    expect(composerChips(chips, { running: false, awaitingAnswer: true })).toEqual([]);
    expect(composerChips(chips, { running: false, awaitingAnswer: false })).toEqual(chips);
  });
});

describe('awaitingAnswer', () => {
  const question = { question: 'Which tone?', answers: [{ title: 'Grim' }] } as never;

  it('should wait on the latest reply’s question until the author writes something after it', () => {
    expect(
      awaitingAnswer([
        { role: 'user', ordinal: 1, question: null },
        { role: 'assistant', ordinal: 2, question },
      ]),
    ).toBe(true);
    expect(
      awaitingAnswer([
        { role: 'assistant', ordinal: 2, question },
        { role: 'user', ordinal: 3, question: null },
      ]),
    ).toBe(false);
  });

  it('should ignore a reply with no question or no options', () => {
    expect(awaitingAnswer([])).toBe(false);
    expect(awaitingAnswer([{ role: 'assistant', ordinal: 2, question: null }])).toBe(false);
    expect(awaitingAnswer([{ role: 'assistant', ordinal: 2, question: { question: 'Which tone?', answers: [] } as never }])).toBe(false);
  });

  it('should judge only the latest reply, not an older unanswered one', () => {
    expect(
      awaitingAnswer([
        { role: 'assistant', ordinal: 2, question },
        { role: 'assistant', ordinal: 4, question: null },
      ]),
    ).toBe(false);
  });
});

describe('commitBarView', () => {
  const answered = new Map<number, 'add' | 'decline'>([
    [0, 'add'],
    [1, 'decline'],
  ]);

  it('should offer nothing before any pick, and the picked ones early once there is one', () => {
    expect(commitBarView({ total: 2, decisions: new Map(), committing: false })).toEqual({ kind: 'none' });
    expect(commitBarView({ total: 3, decisions: new Map([[0, 'add']]), committing: false })).toEqual({
      kind: 'partial',
      action: 'Add the 1 picked now',
      text: 'The 2 unanswered are left out.',
    });
  });

  it('should say it is adding only while the commit is in flight', () => {
    expect(commitBarView({ total: 2, decisions: answered, committing: true })).toEqual({ kind: 'committing', text: 'Adding to your Story Bible…' });
  });

  it('should offer "Add now" when every answer is in but nothing is committing — after a reload restores them', () => {
    expect(commitBarView({ total: 2, decisions: answered, committing: false })).toEqual({
      kind: 'ready',
      action: 'Add 1 now',
      text: 'Every suggestion has an answer.',
      failed: false,
    });
    expect(commitBarView({ total: 1, decisions: new Map([[0, 'decline']]), committing: false })).toMatchObject({ kind: 'ready', action: 'Pass on these now' });
  });

  it('should keep the answers and offer the retry after a failed commit', () => {
    expect(commitBarView({ total: 2, decisions: answered, committing: false, error: 'The Story Bible moved on.' })).toEqual({
      kind: 'ready',
      action: 'Add 1 now',
      text: 'Couldn’t finish: The Story Bible moved on. Your answers are kept.',
      failed: true,
    });
  });
});
