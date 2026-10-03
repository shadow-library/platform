import { describe, expect, it } from 'bun:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageModelTagView, TurnModelPanel, type TurnModelPanelProps } from '../src/components/nf/ChatModel';
import { AppliedBlock, type AppliedBlockProps, UndoImpactBody } from '../src/features/chat/AppliedBlock';
import { ChatComposer, type ChatComposerProps } from '../src/features/chat/ChatComposer';
import { checklistView, type OrganiseReceiptView } from '../src/features/chat/chat-view';
import { ComposerModeMenu } from '../src/features/chat/ComposerModeMenu';
import { JobProgress } from '../src/features/chat/JobProgress';
import { OrganiseReceipt, type OrganiseReceiptProps } from '../src/features/chat/OrganiseReceipt';
import { QuestionCard, QuestionCardView, type QuestionCardViewProps } from '../src/features/chat/QuestionCard';
import { ReadyChecklist, type ReadyChecklistProps } from '../src/features/chat/ReadyChecklist';
import { StreamedTurn } from '../src/features/chat/StreamedTurn';
import { CommitBar, SuggestionCard, type SuggestionCardProps } from '../src/features/chat/SuggestionCard';
import { idleChatTurnStream } from '../src/lib/apis/refinement.api';
import { ApiError } from '../src/lib/apis/transport';

const noop = (): void => undefined;
const html = (element: ReactElement): string => renderToStaticMarkup(element);
const FAILURE = new ApiError(500, { code: 'X', type: 'SERVER_ERROR', message: 'Backend down' });

const PROGRESS = checklistView([
  { key: 'premise', label: 'Premise', why: 'Everything hangs on it', status: 'answered' },
  { key: 'opposition', label: 'Who opposes her', why: 'Chapter one needs a pressure', status: 'open' },
]);

function checklist(overrides: Partial<ReadyChecklistProps> = {}): string {
  return html(createElement(ReadyChecklist, { view: PROGRESS, loading: false, onRetry: noop, expanded: true, onToggle: noop, onMark: noop, ...overrides }));
}

describe('ReadyChecklist', () => {
  it('should show loading and error states, the error with a way to try again', () => {
    expect(checklist({ view: undefined, loading: true })).toContain('Loading your checklist');
    const error = checklist({ view: undefined, error: FAILURE });
    expect(error).toContain('Couldn’t load your checklist');
    expect(error).toContain('Try again');
  });

  it('should render nothing when there is nothing to advise', () => {
    expect(checklist({ view: checklistView([]) })).toBe('');
    expect(checklist({ view: checklistView([{ key: 'premise', label: 'Premise', why: 'x', status: 'answered' }]) })).toBe('');
  });

  it('should be a quiet keyboard disclosure that explains each open item without pressing for answers', () => {
    const open = checklist();
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('Story so far');
    expect(open).toContain('1 settled');
    expect(open).toContain('>Settled<');
    expect(open).not.toContain('of 2');
    expect(open).not.toContain('advice, not a gate');
    expect(open).toContain('Chapter one needs a pressure');
    expect(open).toContain('aria-label="Mark “Who opposes her” undecided for now"');
    expect(open).toContain('aria-label="Dismiss “Who opposes her”"');
    expect(open).not.toContain('dismissed.');
    const closed = checklist({ expanded: false });
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('Who opposes her');
  });

  it('should note how many items were dismissed only when there are some', () => {
    const view = checklistView([
      { key: 'opposition', label: 'Who opposes her', why: 'x', status: 'open' },
      { key: 'theme', label: 'Theme', why: 'x', status: 'dismissed' },
    ]);
    expect(checklist({ view })).toContain('1 dismissed.');
  });
});

function applied(overrides: Partial<AppliedBlockProps> = {}): string {
  return html(
    createElement(AppliedBlock, {
      rows: [{ index: 0, topic: 'People', value: 'Tamsin Rook: a lamp-keeper’s daughter', quote: 'Tamsin is the keeper’s daughter' }],
      origin: 'words',
      state: 'applied',
      revertible: true,
      onUndo: noop,
      ...overrides,
    }),
  );
}

describe('AppliedBlock', () => {
  it('should list each change with the written value beside the quote it rests on', () => {
    const block = applied();
    expect(block).toContain('Added to your Story Bible — from your words');
    expect(block).toContain('Tamsin Rook: a lamp-keeper’s daughter');
    expect(block).toContain('from your message: “Tamsin is the keeper’s daughter”');
    expect(block).toContain('Undo this change');
  });

  it('should cite note paragraphs for an organise block', () => {
    const block = applied({ quoteSource: 'notes', rows: [{ index: 0, topic: 'Places', value: 'Low Harrow', paragraphs: [5] }] });
    expect(block).toContain('— from your notes');
    expect(block).toContain('from your notes, ¶5');
  });

  it('should drop Undo when the change cannot be reverted and say so once it is undone', () => {
    expect(applied({ revertible: false })).not.toContain('Undo this change');
    const undone = applied({ state: 'reverted' });
    expect(undone).toContain('Undone — your Story Bible is back as it was.');
    expect(undone).not.toContain('role="status"');
  });
});

describe('UndoImpactBody', () => {
  const body = (props: Partial<Parameters<typeof UndoImpactBody>[0]>): string => html(createElement(UndoImpactBody, { loading: false, onRetry: noop, ...props }));

  it('should show loading, error and nothing-relies states', () => {
    expect(body({ loading: true })).toContain('Checking what relies on this change');
    expect(body({ error: FAILURE })).toContain('Try again');
    expect(body({ impact: { proposalId: 'p', dependents: [], finalUnaffected: 0 } })).toContain('Nothing else relies on it yet');
  });

  it('should list plans, drafts, knowledge and suggestions that rely on it, and the final ones left alone', () => {
    const list = body({
      impact: {
        proposalId: 'p',
        dependents: [
          { kind: 'plan', ref: 'chapter:4', chapter: 4, because: 'entity:council', final: false },
          { kind: 'suggestion', ref: 'proposal:9', because: 'entity:council', final: false },
          { kind: 'knowledge', ref: 'knowledge:hollis/debt', chapter: 2, because: 'fact:debt', final: true },
        ],
        finalUnaffected: 1,
      },
    });
    expect(list).toContain('Relies on it: 1 chapter plan · 1 waiting suggestion · 1 thing a character knows.');
    expect(list).toContain('Chapter 4 plan');
    expect(list).toContain('hollis knows debt (since chapter 2)');
    expect(list).toContain('final — stays as it is');
    expect(list).toContain('1 final chapter or plan also rely on it');
  });
});

const COUNCIL = {
  op: 'entity.upsert',
  entityKey: 'council',
  type: 'faction',
  name: 'The Tidewarden’s council',
  body: 'Families who trade memories.',
  rationale: 'Gives chapter one a pressure.',
};

function suggestion(overrides: Partial<SuggestionCardProps> = {}): string {
  return html(
    createElement(SuggestionCard, {
      op: COUNCIL,
      remaining: 1,
      busy: false,
      onAdd: noop,
      onEditFirst: noop,
      onDraftChange: noop,
      onSaveEdit: noop,
      onCancelEdit: noop,
      onDecline: noop,
      onUndoDecision: noop,
      onScope: noop,
      ...overrides,
    }),
  );
}

describe('SuggestionCard', () => {
  it('should offer Add, Edit first and Not this on a labelled suggestion', () => {
    const card = suggestion();
    expect(card).toContain('Suggested — not in your notes');
    expect(card).toContain('Factions &amp; peoples: The Tidewarden’s council');
    expect(card).toContain('Gives chapter one a pressure.');
    for (const label of ['Add to Story Bible', 'Edit first', 'Not this']) expect(card).toContain(label);
  });

  it('should cite the notes paragraphs when there is no organise entry, and render the body as markdown', () => {
    const card = suggestion({ op: { ...COUNCIL, body: 'Families who **trade** memories.', rationale: 'Straight from ¶3 and ¶5–¶6.' }, note: undefined });
    expect(card).toContain('From your notes · ¶3, ¶5–¶6');
    expect(card).toContain('Factions &amp; peoples: The Tidewarden’s council');
    expect(card).toContain('<strong>trade</strong>');
  });

  it('should carry an organise label instead of the default eyebrow, and say when declining retires a Notebook entry', () => {
    expect(suggestion({ note: { eyebrow: 'A rule from your notes', retires: false } })).toContain('A rule from your notes');
    expect(suggestion({ note: { eyebrow: 'A rule from your notes', retires: true } })).toContain('declining it takes it out');
  });

  it('should edit the written value before adding it', () => {
    const editing = suggestion({ draft: 'Families who sell memories.' });
    expect(editing).toContain('aria-label="Edit “The Tidewarden’s council” before adding"');
    expect(editing).toContain('Save and add');
    expect(suggestion({ draft: '  ' })).toContain('disabled=""');
  });

  it('should confirm an add, then ask when to suggest a declined idea again', () => {
    const willAdd = suggestion({ decision: 'add' });
    expect(willAdd).toContain('Will add “The Tidewarden’s council” to Factions &amp; peoples — 1 left to answer.');
    expect(willAdd).not.toContain('Added');
    expect(willAdd).not.toContain('role="status"');
    expect(suggestion({ decision: 'add', remaining: 0 })).not.toContain('adding now');
    expect(suggestion({ decision: 'add', remaining: 0, committing: true })).toContain('adding now');
    const declined = suggestion({ decision: 'decline' });
    expect(declined).toContain('Should it ever be suggested again?');
    expect(declined).toContain('Never');
    expect(declined).toContain('Not now — maybe later');
    expect(declined).toContain('Not for this version');
    expect(declined).toContain('Change');
    const scoped = suggestion({ decision: 'decline', scope: 'not_now' });
    expect(scoped).toContain('Noted in your Notebook');
    expect(scoped).toContain('aria-pressed="true"');
    expect(suggestion({ decision: 'decline', canUndo: false })).not.toContain('Change');
  });

  it('should offer no scope past "not now" for a rule, which the server refuses to anchor to no record (LDG_008)', () => {
    const declined = suggestion({ op: { op: 'organise.rule', rule: 'No magic at sea' }, decision: 'decline' });
    expect(declined).toContain('Never');
    expect(declined).toContain('Not now — maybe later');
    expect(declined).not.toContain('Not for this version');
  });

  it('should hide Change once a decline has a recorded scope, so it can’t flip back to Keep', () => {
    expect(suggestion({ decision: 'decline' })).toContain('Change');
    expect(suggestion({ decision: 'decline', scope: 'never' })).not.toContain('Change');
    expect(suggestion({ decision: 'decline', scope: 'not_this_version' })).not.toContain('Change');
  });

  it('should offer a plain "Don’t run it" decline for an action, with no scope buttons and no Notebook mention', () => {
    const action = { op: 'action.organise_notes' };
    const pending = suggestion({ op: action, decision: undefined });
    expect(pending).toContain('Don’t run it');
    expect(pending).not.toContain('Not this');
    const declined = suggestion({ op: action, decision: 'decline' });
    expect(declined).toContain('Won’t run “Organise your notes”.');
    expect(declined).not.toContain('Never');
    expect(declined).not.toContain('Not now');
    expect(declined).not.toContain('Noted in your Notebook');
    expect(declined).toContain('Change');
    expect(suggestion({ op: action, decision: 'decline', canUndo: false })).not.toContain('Change');
  });
});

describe('QuestionCard', () => {
  const question = {
    question: 'What does the reader wait for at the end of volume one?',
    why: 'This shapes the whole volume.',
    options: [
      { title: 'Why the sea spared her', why: 'A mystery about Tamsin.', tradeOff: 'waits for volume 2', recommended: true },
      { title: 'Whether Low Harrow survives', tradeOff: 'the ledger fades' },
    ],
  };

  const view = (overrides: Partial<QuestionCardViewProps> = {}): string =>
    html(
      createElement(QuestionCardView, {
        question,
        eyebrow: 'Question 2 of 8 · Who opposes her',
        settled: false,
        disabled: false,
        onSelect: noop,
        onConfirm: noop,
        onUndecided: noop,
        onOwnWords: noop,
        ...overrides,
      }),
    );
  const buttons = (card: string): string[] => card.match(/<button[^>]*>/g) ?? [];

  it('should lead with the eyebrow, label the card by it and the question, and show trade-offs and the recommendation', () => {
    const card = view();
    expect(card).toContain('Question 2 of 8 · Who opposes her');
    expect(card).toMatch(/aria-labelledby="[^"]+ [^"]+"/);
    expect(card).toContain('Claude’s pick');
    expect(card).not.toContain('My pick');
    expect(card).toContain('Trade-off: waits for volume 2');
    expect(card.match(/Trade-off:/g)).toHaveLength(2);
  });

  it('should offer every option as an unpressed toggle with no answer chosen yet', () => {
    const card = view();
    expect(card.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(card).not.toContain('aria-pressed="true"');
    expect(card).toContain('Choose an option');
    expect(buttons(card).at(-1)).toContain('disabled=""');
  });

  it('should press the chosen option and name it on the enabled confirm button', () => {
    const card = view({ selected: 1 });
    expect(card.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(card.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(card).toContain('Answer: Whether Low Harrow survives');
    expect(card).not.toContain('Choose an option');
    expect(buttons(card).at(-1)).not.toContain('disabled=""');
  });

  it('should offer own words and undecided on the left, with the confirm button last', () => {
    const card = view();
    expect(card.indexOf('Answer in my own words')).toBeLessThan(card.indexOf('Undecided for now'));
    expect(card.indexOf('Undecided for now')).toBeLessThan(card.indexOf('Choose an option'));
    expect(buttons(card)).toHaveLength(5);
  });

  it('should keep own words available but lock the options, undecided and confirm while a turn runs', () => {
    const card = view({ selected: 0, disabled: true });
    const [first, second, ownWords, undecided, confirm] = buttons(card);
    expect(first).toContain('disabled=""');
    expect(second).toContain('disabled=""');
    expect(ownWords).not.toContain('disabled=""');
    expect(undecided).toContain('disabled=""');
    expect(confirm).toContain('disabled=""');
  });

  it('should render a three-option and a four-option question as plain toggles', () => {
    const options = [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }];
    expect(view({ question: { question: 'Which?', options: options.slice(0, 3) } }).match(/aria-pressed=/g)).toHaveLength(3);
    const four = view({ question: { question: 'Which?', options }, selected: 3 });
    expect(four.match(/aria-pressed=/g)).toHaveLength(4);
    expect(four).toContain('Answer: D');
    expect(four).not.toContain('Claude’s pick');
    expect(four).not.toContain('Trade-off');
  });

  it('should lock the options once answered and drop the footer', () => {
    const card = view({ settled: true, eyebrow: 'Question · Who opposes her' });
    expect(card).toContain('data-settled="true"');
    expect(card).toContain('Question · Who opposes her');
    expect(card).not.toContain('Undecided for now');
    expect(card).not.toContain('Answer in my own words');
    expect(card).not.toContain('Choose an option');
    expect(card.match(/disabled=""/g)).toHaveLength(2);
  });

  it('should show no pressed option on a settled card even if one was picked', () => {
    const card = html(createElement(QuestionCard, { question, eyebrow: 'Question', settled: true, disabled: false, onPick: noop, onUndecided: noop, onOwnWords: noop }));
    expect(card).not.toContain('aria-pressed="true"');
  });
});

describe('JobProgress', () => {
  const running = { title: 'Planning chapter 4…', detail: 'Drafting the plan', tone: 'running' as const, cancellable: true };

  it('should show a running job with Cancel and say it survives leaving', () => {
    const card = html(createElement(JobProgress, { view: running, stream: 'live', cancelling: false, onCancel: noop }));
    expect(card).toContain('Drafting the plan');
    expect(card).toContain('Cancel');
    expect(card).toContain('it keeps going');
  });

  it('should say when the stream is reconnecting', () => {
    expect(html(createElement(JobProgress, { view: running, stream: 'reconnecting', cancelling: false, onCancel: noop }))).toContain('Reconnecting');
  });

  it('should show a failure without Cancel and a finished job as a receipt with its card', () => {
    const failed = html(
      createElement(JobProgress, {
        view: { title: 'Planning chapter 4 stopped with an error', detail: 'Gateway timed out', tone: 'failed', cancellable: false },
        stream: 'live',
        cancelling: false,
        onCancel: noop,
      }),
    );
    expect(failed).toContain('Gateway timed out');
    expect(failed).not.toContain('Cancel');
    const done = html(
      createElement(
        JobProgress,
        { view: { title: 'Planned chapter 4', tone: 'done', cancellable: false }, stream: 'live', cancelling: false, onCancel: noop },
        createElement('p', null, 'the card'),
      ),
    );
    expect(done).toContain('Planned chapter 4');
    expect(done).toContain('<p>the card</p>');
  });
});

describe('OrganiseReceipt', () => {
  const view: OrganiseReceiptView = {
    summary: '4 entries from your notes — read from 3 paragraphs',
    unused: [{ number: 2, text: 'maybe the lamp remembers?' }, { number: 3 }],
    renumbered: false,
  };
  const receipt = (overrides: Partial<OrganiseReceiptProps> = {}): string =>
    html(createElement(OrganiseReceipt, { view, expanded: true, onToggle: noop, left: new Set<number>(), busy: false, onAdd: noop, onLeave: noop, ...overrides }));

  it('should list the unused paragraphs with a way to add or leave each', () => {
    const block = receipt();
    expect(block).toContain('Not used yet: 2 paragraphs of your notes');
    expect(block).toContain('“maybe the lamp remembers?”');
    expect(block).toContain('Open your notes to read it.');
    expect(block).toContain('aria-expanded="true"');
    expect(block.match(/Add to Story Bible/g)).toHaveLength(2);
  });

  it('should surface why part of it waits and warn when the numbers moved', () => {
    const block = receipt({ applyNote: 'One entry quotes a question.', view: { ...view, renumbered: true } });
    expect(block).toContain('One entry quotes a question.');
    expect(block).toContain('these numbers may point elsewhere now');
  });

  it('should collapse the list and drop paragraphs left in the notes', () => {
    expect(receipt({ expanded: false })).not.toContain('maybe the lamp');
    expect(receipt({ left: new Set([2, 3]) })).toContain('Everything here is left in your notes for now.');
  });
});

describe('StreamedTurn', () => {
  it('should mark the turn busy while it streams and keep a stopped reply', () => {
    expect(html(createElement(StreamedTurn, { stream: { ...idleChatTurnStream, status: 'streaming' }, mode: 'auto', now: 0 }))).toContain('aria-busy="true"');
    const stopped = html(createElement(StreamedTurn, { stream: { ...idleChatTurnStream, status: 'stopped' }, mode: 'auto', now: 0 }));
    expect(stopped).toContain('Stopped');
    expect(stopped).toContain('aria-busy="false"');
  });
});

function composer(overrides: Partial<ChatComposerProps> = {}): string {
  return html(
    createElement(ChatComposer, {
      input: '',
      onInputChange: noop,
      onSend: noop,
      stopping: false,
      sending: false,
      running: false,
      locked: false,
      switching: false,
      chips: [{ label: 'Plan chapter 1', prompt: 'Let’s plan chapter 1.' }],
      onChip: noop,
      modeMenu: createElement('span', null, 'mode-menu'),
      modelMenu: createElement('span', null, 'model-menu'),
      justDiscussing: false,
      proseEdits: false,
      onProseEditsChange: noop,
      onEditQueued: noop,
      onSendQueued: noop,
      announcement: 'Forge replied.',
      ...overrides,
    }),
  );
}

describe('ChatComposer', () => {
  it('should label the message box, offer prompt chips and announce the finished turn politely', () => {
    const box = composer();
    expect(box).toContain('aria-label="Message"');
    expect(box).toContain('aria-label="Suggested prompts"');
    expect(box).toContain('Plan chapter 1');
    expect(box).toContain('aria-live="polite"');
    expect(box).toContain('Forge replied.');
  });

  it('should put the mode, the model and Edit prose in one toolbar row', () => {
    const box = composer();
    expect(box.indexOf('mode-menu')).toBeLessThan(box.indexOf('model-menu'));
    expect(box.indexOf('model-menu')).toBeLessThan(box.indexOf('aria-label="Edit prose"'));
    expect(box.indexOf('aria-label="Edit prose"')).toBeLessThan(box.indexOf('aria-label="Send"'));
  });

  it('should show discussing as a dashed box and a think-out-loud prompt', () => {
    const box = composer({ justDiscussing: true });
    expect(box).toContain('data-discussing="true"');
    expect(box).toContain('Think out loud — what if…');
  });

  it('should disable Send on an empty draft and keep it a labelled round button', () => {
    expect(composer()).toMatch(/aria-label="Send"[^>]*disabled=""|disabled=""[^>]*aria-label="Send"/);
    expect(composer({ input: 'go' })).not.toMatch(/disabled=""[^>]*aria-label="Send"|aria-label="Send"[^>]*disabled=""/);
  });

  it('should turn Send into a labelled Stop while a turn runs and keep the box usable for a queued message', () => {
    const running = composer({ input: 'go', running: true, onStop: noop });
    expect(running).toContain('aria-label="Stop"');
    expect(running).not.toContain('aria-label="Send"');
    expect(running).toContain('Type to queue a message. It sends when this reply finishes.');
    expect(running).not.toMatch(/<textarea[^>]*disabled/);
  });

  it('should disable Stop until the run is known', () => {
    expect(composer({ running: true })).toMatch(/aria-label="Stop"[^>]*disabled=""|disabled=""[^>]*aria-label="Stop"/);
  });

  it('should show a queued message with Edit, and Send now only once it is held', () => {
    const waiting = composer({ running: true, queued: { text: 'Make it darker', held: false } });
    expect(waiting).toContain('Queued');
    expect(waiting).toContain('Make it darker');
    expect(waiting).toContain('Edit');
    expect(waiting).not.toContain('Send now');
    expect(waiting).toContain('One message is queued.');
    const held = composer({ queued: { text: 'Make it darker', held: true, note: 'The reply failed, so this is waiting for you.' } });
    expect(held).toContain('Send now');
    expect(held).toContain('The reply failed, so this is waiting for you.');
    expect(held).not.toContain('Suggested prompts');
  });

  it('should explain a no-op Enter with a caption', () => {
    expect(composer({ caption: 'One message is already queued.' })).toContain('One message is already queued.');
  });
});

function panel(overrides: Partial<TurnModelPanelProps> = {}): string {
  const project = { contentMode: 'standard' as const, costTier: 'balanced' as const };
  return html(
    createElement(TurnModelPanel, {
      choice: project,
      defaults: { choice: project, source: 'project' },
      resolved: { label: 'Claude Sonnet 5', inputPricePerMToken: 3, outputPricePerMToken: 15 },
      resolving: false,
      onChange: noop,
      onReset: noop,
      onDone: noop,
      onClearPin: noop,
      ...overrides,
    }),
  );
}

describe('ComposerModeMenu', () => {
  it('should name the current mode on its trigger and be disabled while a turn runs', () => {
    const pill = html(createElement(ComposerModeMenu, { value: 'just-discuss', onChange: noop }));
    expect(pill).toContain('Just discuss');
    expect(pill).toContain('aria-label="Mode: Just discuss"');
    expect(pill).toContain('data-mode="just-discuss"');
    expect(html(createElement(ComposerModeMenu, { value: 'edit-freely', onChange: noop, disabled: true }))).toContain('disabled=""');
  });
});

describe('ChatComposer notices', () => {
  it('should show a warning above the box', () => {
    const box = composer({ notices: createElement('div', null, '2 suggestions still need an answer') });
    expect(box.indexOf('2 suggestions still need an answer')).toBeLessThan(box.indexOf('aria-label="Message"'));
  });
});

describe('TurnModelPanel', () => {
  it('should offer both model types and all three tiers as radio groups, and name the resolved model', () => {
    const body = panel();
    for (const label of ['Standard', 'Unrestricted', 'Economy', 'Balanced', 'Performant']) expect(body).toContain(label);
    expect(body.match(/role="radiogroup"/g)).toHaveLength(2);
    expect(body).toContain('Claude Sonnet 5');
    expect(body).toContain('$3 in · $15 out per million tokens');
    expect(body).toContain('This is the project default.');
    const own = panel({ defaults: { choice: { contentMode: 'standard', costTier: 'balanced' }, source: 'chat' } });
    expect(own).toContain('This is this chat’s own setting.');
    expect(own).not.toContain('This is the this chat');
  });

  it('should say a changed pick is for this turn only and allow going back', () => {
    const body = panel({ choice: { contentMode: 'unrestricted', costTier: 'economy' } });
    expect(body).toContain('Applies to your next message and anything it starts');
    expect(body).toContain('Default: Standard · Balanced');
  });

  it('should explain a legacy chat pin and offer to clear it', () => {
    const body = panel({ pinnedModel: 'Claude Opus 5.5' });
    expect(body).toContain('This chat is pinned to Claude Opus 5.5');
    expect(body).toContain('Clear the pin');
    expect(body).not.toContain('per million tokens');
  });

  it('should show while the model is being resolved', () => {
    expect(panel({ resolved: undefined, resolving: true })).toContain('Checking the model…');
  });
});

describe('MessageModelTagView', () => {
  it('should read model · tier · cost · time', () => {
    const tag = html(createElement(MessageModelTagView, { parts: ['Claude Sonnet 5', 'Balanced', '$0.041'], createdAt: '2026-09-26T10:04:00.000Z' }));
    expect(tag).toMatch(/Claude Sonnet 5 · Balanced · \$0\.041 · <time/);
  });
});

describe('CommitBar', () => {
  it('should show the retry with the failure next to it, and nothing to click while committing', () => {
    const failed = html(
      createElement(CommitBar, { view: { kind: 'ready', action: 'Add 1 now', text: 'Couldn’t finish: gone. Your answers are kept.', failed: true }, onCommit: noop }),
    );
    expect(failed).toContain('Add 1 now');
    expect(failed).toContain('Your answers are kept.');
    const committing = html(createElement(CommitBar, { view: { kind: 'committing', text: 'Adding to your Story Bible…' }, onCommit: noop }));
    expect(committing).toContain('aria-busy="true"');
    expect(committing).not.toContain('<button');
    expect(html(createElement(CommitBar, { view: { kind: 'none' }, onCommit: noop }))).toBe('');
  });
});
