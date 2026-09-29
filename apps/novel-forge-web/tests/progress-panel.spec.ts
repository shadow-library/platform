import { describe, expect, it } from 'bun:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AppliedChangeRow, CardChangeRow, ChangesSection, ProgressSection, SourcesSection } from '../src/features/chat/ProgressPanel';
import {
  appliedChanges,
  appliedReceipt,
  cardChanges,
  cardsReceipt,
  changeBreakdown,
  changesView,
  opChangeGroup,
  opDependencyPrompt,
  opErrorText,
  opSequenceStopped,
  type PanelTurn,
  panelTurnOf,
  progressView,
  runOpSequence,
  sourcesView,
  turnRefs,
} from '../src/features/chat/progress-panel-view';
import { TurnReceiptView } from '../src/features/chat/TurnReceipt';
import { TurnLiveTail } from '../src/features/chat/TurnTimeline';
import { type ChatMessageResponse, type ChatTurnResponse, type ProposalResponse } from '../src/lib/apis/api-types.gen';
import {
  type ChatTurnStreamEvent,
  type ChatTurnStreamState,
  type ProposalOpOutcome,
  proposalOpOutcome,
  reduceChatTurnStream,
  startChatTurnStream,
  stopChatTurnStream,
} from '../src/lib/apis/refinement.api';
import { ApiError } from '../src/lib/apis/transport';

const noop = (): void => undefined;
const html = (element: ReactElement): string => renderToStaticMarkup(element);

function message(id: string, ordinal: number, role: 'user' | 'assistant', extra: Partial<ChatMessageResponse> = {}): ChatMessageResponse {
  return { id, sessionId: 's', ordinal, role, content: role === 'user' ? 'hi' : 'Done.', createdAt: '2026-09-29T10:00:00.000Z', ...extra };
}

function proposal(overrides: Partial<ProposalResponse>): ProposalResponse {
  return {
    id: 'p1',
    projectId: 'n',
    scopeType: 'project',
    kind: 'chat',
    status: 'applied',
    changeSet: [],
    baseline: {},
    autoApplied: true,
    revertible: true,
    warnings: [],
    diagnostics: [],
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

const APPLIED = proposal({
  id: 'ap',
  changeSet: [
    { op: 'premise.update', premise: 'A lamp-keeper’s daughter', quote: 'she keeps the lamps' },
    { op: 'bible_document.upsert', section: 'world', slug: 'lamps', frontmatter: { title: 'The lamps' } },
    { op: 'entity.upsert', type: 'character', entityKey: 'tamsin', name: 'Tamsin' },
    { op: 'entity.upsert', type: 'location', entityKey: 'harbour', name: 'The harbour' },
    { op: 'promise.create', key: 'who-lit', label: 'Who lit the first lamp' },
    { op: 'action.plan_chapter' },
  ],
  opResults: [
    { index: 0, status: 'applied', source: 'quoted' },
    { index: 1, status: 'applied', source: 'idea' },
    { index: 2, status: 'reverted', source: 'idea' },
    { index: 3, status: 'applied', source: 'quoted' },
    { index: 4, status: 'failed', source: 'idea', error: 'refused' },
    { index: 5, status: 'pending', source: 'quoted' },
  ],
});

const CARDS = proposal({
  id: 'cp',
  status: 'pending',
  autoApplied: false,
  revertible: false,
  changeSet: [
    { op: 'entity.upsert', type: 'faction', entityKey: 'council', name: 'The Council' },
    { op: 'fact.upsert', factKey: 'curse', name: 'The curse' },
  ],
});

const turn = (extra: Partial<ChatTurnResponse> = {}): ChatTurnResponse =>
  ({ userMessage: message('u2', 3, 'user'), assistantMessage: message('a2', 4, 'assistant'), runId: 'r', ...extra }) as ChatTurnResponse;

const lookup = (tool: string, status: 'running' | 'ok' | 'error', args: Record<string, unknown> = {}): ChatTurnStreamEvent => ({
  type: 'lookup',
  lookup: { round: 0, tool, args, status },
});
const delta: ChatTurnStreamEvent = { type: 'delta', text: 'Here it is.' };
const change = (index: number, group: 'people' | 'pages' = 'people'): ChatTurnStreamEvent => ({
  type: 'change',
  change: { index, op: 'entity.upsert', label: `Change ${index}`, group },
});

function play(events: [ChatTurnStreamEvent, number][]): ChatTurnStreamState {
  return events.reduce((state, [event, at]) => reduceChatTurnStream(state, event, at), startChatTurnStream(0));
}

const FULL: [ChatTurnStreamEvent, number][] = [
  [lookup('get_notes', 'running'), 1000],
  [lookup('get_notes', 'ok'), 3000],
  [lookup('get_bible_document', 'ok', { slug: 'premise' }), 4000],
  [delta, 10_000],
  [change(0), 20_000],
  [change(1, 'pages'), 22_000],
];

const streamTurn = (stream: ChatTurnStreamState): PanelTurn => ({ kind: 'stream', stream });

describe('panelTurnOf', () => {
  const messages = [message('u1', 1, 'user'), message('a1', 2, 'assistant', { appliedProposalId: 'ap' }), message('u2', 3, 'user'), message('a2', 4, 'assistant')];

  it('should follow the running turn', () => {
    const live = play([[delta, 100]]);
    expect(panelTurnOf({ stream: live, streamShown: true, messages })).toEqual({ kind: 'stream', stream: live });
  });

  it('should keep a turn this tab watched, even without changes, and otherwise fall back to the latest turn with changes', () => {
    const done = reduceChatTurnStream(play([[delta, 100]]), { type: 'done', turn: turn() }, 200);
    expect(panelTurnOf({ stream: done, streamShown: false, messages })).toEqual({ kind: 'stream', stream: done });
    const idle = startChatTurnStream(0);
    expect(panelTurnOf({ stream: idle, streamShown: false, messages })).toEqual({ kind: 'message', message: messages[1] as ChatMessageResponse });
    expect(panelTurnOf({ stream: idle, streamShown: false, messages: messages.slice(0, 1) })).toEqual({ kind: 'none' });
  });

  it('should show the reply a receipt asked to review', () => {
    const live = play([[delta, 100]]);
    expect(panelTurnOf({ stream: live, streamShown: false, messages, focus: 'a1' })).toEqual({ kind: 'message', message: messages[1] as ChatMessageResponse });
    expect(panelTurnOf({ stream: live, streamShown: true, messages, focus: 'missing' })).toEqual({ kind: 'stream', stream: live });
  });
});

describe('turnRefs', () => {
  it('should read a settled turn’s proposals and question, and nothing from a running one', () => {
    const question = { question: 'Who opposes her?', answers: [{ title: 'The Council' }] };
    const done = reduceChatTurnStream(
      startChatTurnStream(0),
      { type: 'done', turn: turn({ appliedProposal: APPLIED, proposal: CARDS, assistantMessage: message('a2', 4, 'assistant', { question }) }) },
      10,
    );
    expect(turnRefs(streamTurn(done))).toMatchObject({ messageId: 'a2', appliedProposalId: 'ap', proposalId: 'cp', question: true });
    expect(turnRefs(streamTurn(startChatTurnStream(0)))).toEqual({ question: false });
    expect(turnRefs({ kind: 'message', message: message('a1', 2, 'assistant', { proposalId: 'cp' }) })).toEqual({
      messageId: 'a1',
      appliedProposalId: undefined,
      proposalId: 'cp',
      question: false,
    });
  });
});

describe('progressView', () => {
  const view = (stream: ChatTurnStreamState, now: number, mode: 'auto' | 'manual' = 'auto', changes = 0, question = false) =>
    progressView({ turn: streamTurn(stream), mode, now, changes, question });

  it('should start with every step still to come', () => {
    const start = view(startChatTurnStream(0), 500);
    expect(start.status).toBe('Starting');
    expect(start.steps.map(step => [step.key, step.state])).toEqual([
      ['read', 'pending'],
      ['think', 'pending'],
      ['write', 'pending'],
      ['save', 'pending'],
    ]);
  });

  it('should spin the step running now, count sources read, and time the ones done', () => {
    const reading = view(play(FULL.slice(0, 1)), 2000);
    expect(reading.steps[0]).toMatchObject({ key: 'read', state: 'running', sub: '0 of 1 source' });
    const writing = view(play(FULL.slice(0, 4)), 12_000);
    expect(writing.status).toBe('12s');
    expect(writing.steps.map(step => [step.key, step.state, step.time])).toEqual([
      ['read', 'done', '3s'],
      ['think', 'done', '7s'],
      ['write', 'running', undefined],
      ['save', 'pending', undefined],
    ]);
    const noReply = view(play([[change(0), 500]]), 1000);
    expect(noReply.steps.find(step => step.key === 'write')?.state).toBe('pending');
    const saving = view(play(FULL), 23_000, 'manual');
    expect(saving.steps.at(-1)).toMatchObject({ key: 'save', label: 'Prepare suggestions', state: 'running', sub: '2 so far' });
  });

  it('should settle into done steps with timings, dropping steps that never ran and adding the question', () => {
    const done = reduceChatTurnStream(play(FULL), { type: 'done', turn: turn() }, 24_000);
    const settled = view(done, 99_999, 'auto', 5, true);
    expect(settled.status).toBe('Done · 24s');
    expect(settled.steps.map(step => [step.label, step.state, step.sub, step.time])).toEqual([
      ['Read your notes and Bible', 'done', '2 sources', '3s'],
      ['Think it through', 'done', undefined, '7s'],
      ['Write the reply', 'done', undefined, '10s'],
      ['Save to Story Bible', 'done', '5 changes', '4s'],
      ['Ask about what’s missing', 'done', '1 question', undefined],
    ]);
    const quiet = view(reduceChatTurnStream(play([[delta, 1000]]), { type: 'done', turn: turn() }, 2000), 3000);
    expect(quiet.steps.map(step => step.key)).toEqual(['think', 'write']);
  });

  it('should end a stopped or failed turn on the step it reached', () => {
    const stopped = view(stopChatTurnStream(play(FULL.slice(0, 4)), 15_000), 20_000);
    expect(stopped.status).toBe('Stopped · 15s');
    expect(stopped.steps.map(step => [step.key, step.state])).toEqual([
      ['read', 'done'],
      ['think', 'done'],
      ['write', 'stopped'],
    ]);
    const failed = view(reduceChatTurnStream(play(FULL.slice(0, 1)), { type: 'error', failure: { code: 'X', message: 'boom' } }, 2000), 3000);
    expect(failed.status).toBe('Didn’t finish');
    expect(failed.steps.map(step => [step.key, step.state])).toEqual([['read', 'failed']]);
  });

  it('should show only what a reloaded turn can prove: its reply, its changes and its question', () => {
    const history = progressView({ turn: { kind: 'message', message: message('a1', 2, 'assistant') }, mode: 'manual', now: 0, changes: 2, question: false });
    expect(history).toEqual({
      status: 'Done',
      steps: [
        { key: 'write', label: 'Write the reply', state: 'done' },
        { key: 'save', label: 'Prepare suggestions', state: 'done', sub: '2 changes' },
      ],
    });
  });
});

describe('sourcesView', () => {
  it('should list the lookups in plain words, or say why there are none', () => {
    const view = sourcesView(streamTurn(play([...FULL.slice(0, 2), [lookup('search_lore', 'error', { query: 'lamps' }), 5000]])));
    expect(view.kind === 'list' && view.sources.map(source => [source.label, source.status])).toEqual([
      ['Your notes', 'ok'],
      ['Searched the lore for “lamps”', 'error'],
    ]);
    expect(sourcesView(streamTurn(startChatTurnStream(0)))).toEqual({ kind: 'empty', note: 'Nothing read yet.' });
    expect(sourcesView({ kind: 'message', message: message('a1', 2, 'assistant') }).kind).toBe('empty');
  });
});

describe('changes', () => {
  it('should group ops as the server groups streamed changes', () => {
    expect(opChangeGroup({ op: 'premise.update' })).toBe('premise');
    expect(opChangeGroup({ op: 'bible_document.upsert' })).toBe('pages');
    expect(opChangeGroup({ op: 'entity.upsert', type: 'faction' })).toBe('people');
    expect(opChangeGroup({ op: 'entity.upsert', type: 'location' })).toBe('places');
    expect(opChangeGroup({ op: 'entity.upsert', type: 'power_rule' })).toBe('power');
    expect(opChangeGroup({ op: 'promise.create' })).toBe('threads');
    expect(opChangeGroup({ op: 'fact.upsert' })).toBe('other');
  });

  it('should list what a turn applied with its source and state, leaving out actions', () => {
    expect(appliedChanges(APPLIED).map(row => [row.index, row.label, row.idea, row.state, row.actionable, row.quote])).toEqual([
      [0, 'Premise', false, 'applied', true, 'she keeps the lamps'],
      [1, 'The lamps', true, 'applied', true, undefined],
      [2, 'Tamsin', true, 'reverted', true, undefined],
      [3, 'The harbour', false, 'applied', true, undefined],
      [4, 'Who lit the first lamp', true, 'failed', false, undefined],
    ]);
  });

  it('should carry what each change wrote beside its label, flagging long values to clamp', () => {
    const rows = appliedChanges(APPLIED);
    expect(rows[0]).toMatchObject({ label: 'Premise', value: 'A lamp-keeper’s daughter', valueLong: false });
    expect(rows[2]?.value).toBeUndefined();
    const long = appliedChanges(proposal({ changeSet: [{ op: 'entity.upsert', name: 'Tamsin', body: 'x'.repeat(120) }], opResults: [{ index: 0, status: 'applied' }] }));
    expect(long[0]?.valueLong).toBe(true);
  });

  it('should offer nothing to undo once the whole turn was undone', () => {
    const rows = appliedChanges({ ...APPLIED, status: 'reverted' });
    expect(rows.every(row => !row.actionable)).toBe(true);
    expect(rows.find(row => row.index === 0)?.state).toBe('reverted');
  });

  it('should read a card’s answers while pending and its outcome once committed', () => {
    const decisions = new Map([[0, 'add' as const]]);
    expect(cardChanges(CARDS, decisions).map(row => [row.label, row.state, row.decidable])).toEqual([
      ['The Council', 'add', true],
      ['The curse', 'open', true],
    ]);
    const committed = cardChanges({ ...CARDS, status: 'applied', opResults: [{ index: 0, status: 'applied' }] }, new Map());
    expect(committed.map(row => [row.state, row.decidable])).toEqual([
      ['added', false],
      ['declined', false],
    ]);
    expect(cardChanges({ ...CARDS, status: 'superseded' }, new Map())[0]?.state).toBe('replaced');
    expect(cardChanges({ ...CARDS, changeSet: [{ op: 'action.finalize' }] }, new Map())[0]?.decidable).toBe(false);
  });

  it('should list streamed changes while the turn runs, then rebuild from the settled turn', () => {
    const live = changesView({ turn: streamTurn(play(FULL)), mode: 'auto', decisions: new Map() });
    expect(live).toMatchObject({ kind: 'streamed', count: '2 so far' });
    expect(live.kind === 'streamed' && live.groups.map(group => group.label)).toEqual(['Pages', 'Characters & factions']);

    const done = reduceChatTurnStream(play(FULL), { type: 'done', turn: turn({ appliedProposal: APPLIED, proposal: CARDS }) }, 24_000);
    const settled = changesView({ turn: streamTurn(done), mode: 'auto', applied: APPLIED, cards: CARDS, decisions: new Map() });
    expect(settled).toMatchObject({ kind: 'settled', count: '3 saved · 2 to review', cardsTitle: 'Needs your OK' });
    expect(settled.kind === 'settled' && settled.applied.map(group => group.label)).toEqual(['Premise', 'Pages', 'Characters & factions', 'Places', 'Open threads']);
  });

  it('should say why there is nothing to list', () => {
    expect(changesView({ turn: streamTurn(startChatTurnStream(0)), mode: 'manual', decisions: new Map() })).toEqual({
      kind: 'empty',
      note: 'Changes appear here for you to review.',
    });
    const stopped = stopChatTurnStream(play(FULL), 30_000);
    expect(changesView({ turn: streamTurn(stopped), mode: 'auto', decisions: new Map() })).toEqual({ kind: 'empty', note: 'This turn ended before its changes were settled.' });
    const quiet = { kind: 'message', message: message('a1', 2, 'assistant') } as const;
    expect(changesView({ turn: quiet, mode: 'auto', decisions: new Map() })).toEqual({ kind: 'empty', note: 'No Story Bible changes this turn.' });
    expect(changesView({ turn: quiet, mode: 'auto', cards: { ...CARDS, kind: 'chapter_plan' }, decisions: new Map() }).kind).toBe('empty');
  });
});

describe('receipts', () => {
  it('should sum up saved changes by the shape of the Story Bible', () => {
    expect(changeBreakdown([{ group: 'premise' }, { group: 'pages' }, { group: 'pages' }, { group: 'people' }, { group: 'places' }, { group: 'threads' }])).toBe(
      'Premise, 2 pages, 2 records, 1 open thread',
    );
  });

  it('should count what is still applied, name the ideas, and offer Undo all', () => {
    expect(appliedReceipt(APPLIED, 2)).toEqual({
      kind: 'applied',
      title: 'Updated your Story Bible · 3 changes',
      detail: 'Premise, 1 page, 1 record · 1 is Forge’s idea · 1 undone · 2 need your OK',
      canUndoAll: true,
    });
    expect(appliedReceipt({ ...APPLIED, status: 'reverted' }, 0)).toEqual({ kind: 'reverted', title: 'Undone — your Story Bible is back as it was.' });
    const allUndone = { ...APPLIED, opResults: (APPLIED.opResults ?? []).map(result => ({ ...result, status: result.status === 'applied' ? 'reverted' : result.status })) };
    expect(appliedReceipt(allUndone, 0)).toEqual({ kind: 'reverted', title: 'Every change from this turn was undone.' });
  });

  it('should count the cards still waiting and offer Add all until every one has an answer', () => {
    expect(cardsReceipt(CARDS, { decisions: new Map([[0, 'decline']]), committing: false })).toEqual({
      kind: 'cards',
      tone: 'waiting',
      count: 1,
      title: '1 change waiting for you',
      detail: 'Nothing is saved until you add it',
      canAddAll: true,
    });
    expect(cardsReceipt(CARDS, { decisions: new Map([[0, 'add']]), committing: true }).kind === 'cards').toBe(true);
    expect(
      cardsReceipt(CARDS, {
        decisions: new Map([
          [0, 'add'],
          [1, 'add'],
        ]),
        committing: false,
        error: 'Offline.',
      }),
    ).toMatchObject({ title: 'All changes answered', detail: 'Couldn’t finish: Offline.', canAddAll: false });
    expect(cardsReceipt({ ...CARDS, status: 'applied', opResults: [{ index: 1, status: 'applied' }] }, { decisions: new Map(), committing: false })).toMatchObject({
      tone: 'settled',
      title: 'Added 1 change to your Story Bible',
      detail: 'Passed on 1',
    });
    expect(cardsReceipt({ ...CARDS, kind: 'chapter_plan' }, { decisions: new Map(), committing: false })).toEqual({ kind: 'none' });
  });
});

describe('per-change undo and redo', () => {
  it('should name the other changes to move first and how many move in all', () => {
    expect(opDependencyPrompt('undo', ['Tamsin', 'The harbour'])).toEqual({ lead: 'Other changes rely on it. Undo these too: “Tamsin”, “The harbour”.', confirm: 'Undo these 3' });
    expect(opDependencyPrompt('redo', ['Tamsin'], ['The lamps'])).toEqual({
      lead: 'It relies on changes that are undone. Redo these first: “Tamsin”. “The lamps” was already redone.',
      confirm: 'Redo these 2',
    });
  });

  it('should move the other changes first and the chosen one last', async () => {
    const sent: number[] = [];
    const send = async (index: number): Promise<ProposalOpOutcome> => {
      sent.push(index);
      return { kind: 'done', proposal: APPLIED };
    };
    expect(await runOpSequence(send, [3, 2, 1])).toEqual({ kind: 'done' });
    expect(sent).toEqual([3, 2, 1]);
  });

  it('should merge a refused step’s own dependencies ahead of the steps still to go, keeping what already moved', async () => {
    const send = async (index: number): Promise<ProposalOpOutcome> => (index === 2 ? { kind: 'blocked', opIndexes: [4, 3] } : { kind: 'done', proposal: APPLIED });
    expect(await runOpSequence(send, [5, 2, 3, 1])).toEqual({ kind: 'blocked', before: [4, 3, 2], moved: [5] });
    expect(await runOpSequence(async () => ({ kind: 'blocked', opIndexes: [0] }), [1])).toEqual({ kind: 'blocked', before: [0], moved: [] });
  });

  it('should name the step a sequence failed at and what had already moved', async () => {
    const error = new ApiError(409, { code: 'RFN_018', type: 'Conflict', message: 'not clean' });
    const send = async (index: number): Promise<ProposalOpOutcome> => {
      if (index === 2) throw error;
      return { kind: 'done', proposal: APPLIED };
    };
    expect(await runOpSequence(send, [3, 2, 1])).toEqual({ kind: 'failed', at: 2, moved: [3], error });
    expect(opSequenceStopped('undo', 'The lamps', ['Tamsin'])).toBe('Stopped at “The lamps”, so this wasn’t undone. “Tamsin” was already undone.');
  });

  it('should put a refusal in plain words and keep an unknown one’s own message', () => {
    expect(opErrorText('RFN_017', 'x')).toBe('The whole turn was undone, so this change can’t be redone on its own.');
    expect(opErrorText('RFN_006', 'x')).toBe('Its record changed since, so it can’t be switched back here.');
    expect(opErrorText('NOPE', 'The server said no.')).toBe('The server said no.');
  });

  it('should turn a modelled 409 into the changes to move first, or the error it stands for', () => {
    expect(proposalOpOutcome({ proposal: APPLIED, opIndex: 1, changed: true, artifacts: [], staleMarked: [] })).toEqual({ kind: 'done', proposal: APPLIED });
    expect(proposalOpOutcome({ code: 'RFN_015', message: 'relied on', details: { opIndexes: [3, 2] } })).toEqual({ kind: 'blocked', opIndexes: [3, 2] });
    let thrown: unknown;
    try {
      proposalOpOutcome({ code: 'RFN_018', message: 'not clean' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown instanceof ApiError && [thrown.status, thrown.code, thrown.message]).toEqual([409, 'RFN_018', 'not clean']);
  });
});

describe('ProgressPanel sections', () => {
  it('should mark the running step for assistive tech and time the finished ones', () => {
    const out = html(createElement(ProgressSection, { view: progressView({ turn: streamTurn(play(FULL.slice(0, 4))), mode: 'auto', now: 12_000, changes: 0, question: false }) }));
    expect(out).toContain('Progress');
    expect(out).toContain('aria-current="step"');
    expect(out).toContain('Write the reply<span');
    expect(out).toContain(', in progress');
    expect(out).toContain('<span>3s</span>');
    expect(html(createElement(ProgressSection, { view: { status: '', steps: [] } }))).toContain('Send a message');
  });

  it('should list sources with their status in words', () => {
    const out = html(createElement(SourcesSection, { view: sourcesView(streamTurn(play(FULL.slice(0, 1)))) }));
    expect(out).toContain('Your notes');
    expect(out).toContain(', reading');
  });

  it('should label an applied change’s undo, tag ideas, quote the author and ask before moving other changes', () => {
    const [premise, lamps] = appliedChanges(APPLIED);
    const row = (props: Partial<Parameters<typeof AppliedChangeRow>[0]>): string =>
      html(createElement(AppliedChangeRow, { change: premise ?? lamps!, locked: false, busy: false, onToggle: noop, onConfirm: noop, onCancel: noop, ...props }));
    expect(row({})).toContain('aria-label="Undo “Premise”"');
    expect(row({})).toContain('from your message: “she keeps the lamps”');
    expect(row({})).toContain('A lamp-keeper’s daughter');
    const long = appliedChanges(proposal({ changeSet: [{ op: 'entity.upsert', name: 'Tamsin', body: 'y'.repeat(120) }], opResults: [{ index: 0, status: 'applied' }] }))[0];
    const clamped = row({ change: long });
    expect(clamped).toContain('data-clamped');
    expect(clamped).toContain('aria-expanded="false"');
    expect(clamped).toContain('Show more');
    expect(row({ change: lamps })).toContain('idea');
    const prompt = row({ prompt: opDependencyPrompt('undo', ['Tamsin']), error: 'It couldn’t be switched back cleanly, so nothing was changed.' });
    expect(prompt).toContain('Undo these too');
    expect(prompt).toContain('Undo these 2');
    expect(prompt).toContain('role="alert"');
    expect(row({ change: { ...lamps!, state: 'reverted' } })).toContain('Redo');
  });

  it('should answer a card with pressed add and decline buttons, or say where to answer it', () => {
    const [council] = cardChanges(CARDS, new Map([[0, 'add']]));
    const out = html(createElement(CardChangeRow, { change: council!, busy: false, onDecide: noop }));
    expect(out).toContain('aria-label="Answer “The Council”"');
    expect(out).toContain('aria-label="Add"');
    expect(out).toContain('aria-pressed="true"');
    const oneWay = cardChanges({ ...CARDS, changeSet: [{ op: 'action.finalize', upTo: 3 }] }, new Map())[0];
    expect(html(createElement(CardChangeRow, { change: oneWay!, busy: false, onDecide: noop }))).toContain('Answer it on its card in the chat');
  });

  it('should head the changes with their count and draw the streamed labels', () => {
    const out = html(createElement(ChangesSection, { view: changesView({ turn: streamTurn(play(FULL)), mode: 'auto', decisions: new Map() }) }));
    expect(out).toContain('Story Bible changes');
    expect(out).toContain('2 so far');
    expect(out).toContain('Change 1');
    expect(out).toContain('data-section="changes"');
  });
});

describe('TurnReceiptView', () => {
  it('should offer Review and Undo all for saved changes, and Add all for waiting ones', () => {
    const saved = html(createElement(TurnReceiptView, { view: appliedReceipt(APPLIED, 0), onReview: noop, onUndoAll: noop }));
    expect(saved).toContain('Updated your Story Bible · 3 changes');
    expect(saved).toContain('Review in panel');
    expect(saved).toContain('Undo all');
    const waiting = html(createElement(TurnReceiptView, { view: cardsReceipt(CARDS, { decisions: new Map(), committing: false }), onReview: noop, onAddAll: noop }));
    expect(waiting).toContain('2 changes waiting for you');
    expect(waiting).toContain('Add all');
    const reverted = html(createElement(TurnReceiptView, { view: appliedReceipt({ ...APPLIED, status: 'reverted' }, 0), onReview: noop, onUndoAll: noop }));
    expect(reverted).not.toContain('Undo all');
    expect(html(createElement(TurnReceiptView, { view: { kind: 'none' }, onReview: noop }))).toBe('');
  });
});

describe('TurnLiveTail progress link', () => {
  it('should offer the progress sheet from the running turn only when asked to', () => {
    expect(html(createElement(TurnLiveTail, { tail: { kind: 'working', elapsed: '3s', slow: false }, onProgress: noop }))).toContain('>Progress</button>');
    expect(html(createElement(TurnLiveTail, { tail: { kind: 'working', elapsed: '3s', slow: false } }))).not.toContain('Progress');
  });
});
