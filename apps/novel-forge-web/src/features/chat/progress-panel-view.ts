import { type ChatMessageResponse, type ChatTurnTraceResponse, type ProposalResponse } from '@/lib/apis/api-types.gen';
import { type ChatTurnChangeGroup, type ChatTurnStreamState, type ProposalOpDirection, type ProposalOpOutcome } from '@/lib/apis/refinement.api';
import { turnPhase, turnSummary } from '@/lib/chat-turn-phase';
import { type TurnSource, turnSources } from '@/lib/chat-turn-timeline';
import { formatElapsed } from '@/lib/format';
import { type ChangeOp } from '@/lib/proposals';

import { isActionOp, opSubject, opWrittenText, proposalPresentation, questionOf, type SessionMode, type SuggestionDecision } from './chat-view';

/** The turn the panel follows: the one running, one this tab watched settle, or one from the transcript. */
export type PanelTurn = { kind: 'none' } | { kind: 'stream'; stream: ChatTurnStreamState } | { kind: 'message'; message: ChatMessageResponse };

export interface PanelTurnInput {
  stream: ChatTurnStreamState;
  /** The transcript is still drawing the stream rather than the saved reply: running, stopped, failed, or done but not yet refetched. */
  streamShown: boolean;
  messages: readonly ChatMessageResponse[];
  /** A reply the author asked to review from its receipt; otherwise the panel follows the latest turn. */
  focus?: string;
}

function hasChanges(message: ChatMessageResponse): boolean {
  return Boolean(message.appliedProposalId || message.proposalId);
}

export function panelTurnOf({ stream, streamShown, messages, focus }: PanelTurnInput): PanelTurn {
  const watched = stream.status === 'done' ? stream.turn.assistantMessage.id : undefined;
  const focused = focus ? messages.find(message => message.id === focus && message.role === 'assistant') : undefined;
  if (focused) return focused.id === watched ? { kind: 'stream', stream } : { kind: 'message', message: focused };
  if (streamShown) return { kind: 'stream', stream };
  const replies = messages.filter(message => message.role === 'assistant');
  if (watched && replies.at(-1)?.id === watched) return { kind: 'stream', stream };
  const latest = [...replies].reverse().find(hasChanges);
  if (!latest) return { kind: 'none' };
  return latest.id === watched ? { kind: 'stream', stream } : { kind: 'message', message: latest };
}

export interface TurnRefs {
  messageId?: string;
  appliedProposalId?: string;
  proposalId?: string;
  /** The settled turn's own copies, shown until the proposal queries answer. */
  applied?: ProposalResponse;
  cards?: ProposalResponse;
  question: boolean;
}

export function turnRefs(turn: PanelTurn): TurnRefs {
  if (turn.kind === 'none') return { question: false };
  if (turn.kind === 'message') {
    const { message } = turn;
    return {
      messageId: message.id,
      appliedProposalId: message.appliedProposalId ?? undefined,
      proposalId: message.proposalId ?? undefined,
      question: Boolean(questionOf(message.question)),
    };
  }
  if (turn.stream.status !== 'done') return { question: false };
  const { assistantMessage, appliedProposal, proposal } = turn.stream.turn;
  return {
    messageId: assistantMessage.id,
    appliedProposalId: appliedProposal?.id ?? assistantMessage.appliedProposalId ?? undefined,
    proposalId: proposal?.id ?? assistantMessage.proposalId ?? undefined,
    applied: appliedProposal,
    cards: proposal,
    question: Boolean(questionOf(assistantMessage.question)),
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export type StepKey = 'read' | 'think' | 'write' | 'save' | 'ask';

export type StepState = 'pending' | 'running' | 'done' | 'stopped' | 'failed';

export interface ProgressStep {
  key: StepKey;
  label: string;
  state: StepState;
  sub?: string;
  time?: string;
}

export interface ProgressView {
  status: string;
  steps: ProgressStep[];
}

export interface ProgressInput {
  turn: PanelTurn;
  /** Which way the turn's changes land: saved at once, or prepared as suggestions. */
  mode: SessionMode;
  now: number;
  /** How many changes the settled turn saved or suggested; the live stream counts its own. */
  changes: number;
  question: boolean;
}

const STEP_LABEL: Record<Exclude<StepKey, 'save'>, string> = {
  read: 'Read your notes and Bible',
  think: 'Think it through',
  write: 'Write the reply',
  ask: 'Ask about what’s missing',
};

const SAVE_LABEL: Record<SessionMode, string> = { auto: 'Save to Story Bible', manual: 'Prepare suggestions' };

function sourcesSub(sources: TurnSource[], live: boolean): string {
  const settled = sources.filter(source => source.status !== 'running').length;
  if (live) return `${settled} of ${plural(sources.length, 'source', 'sources')}`;
  const failed = sources.filter(source => source.status === 'error').length;
  const read = plural(sources.length - failed, 'source', 'sources');
  return failed > 0 ? `${read} · ${failed} couldn’t be read` : read;
}

interface StepClock {
  readMs: number;
  thinkMs: number;
  writeMs?: number;
  saveMs?: number;
}

function stepClock(state: ChatTurnStreamState, now: number): StepClock {
  const { timing } = state;
  const end = timing.endedAt ?? now;
  const { thoughtMs } = turnSummary(state, now);
  const wrote = [timing.replyAt, timing.changeAt].filter((at): at is number => at !== null);
  const firstWrite = wrote.length > 0 ? Math.min(...wrote) : end;
  return {
    readMs: timing.startedAt === null ? 0 : Math.max(0, firstWrite - timing.startedAt - thoughtMs),
    thinkMs: thoughtMs,
    writeMs: timing.replyAt === null ? undefined : Math.max(0, (timing.changeAt ?? end) - timing.replyAt),
    saveMs: timing.changeAt === null ? undefined : Math.max(0, end - timing.changeAt),
  };
}

function liveSteps(state: ChatTurnStreamState, mode: SessionMode, now: number): ProgressStep[] {
  const phase = turnPhase(state, now);
  const clock = stepClock(state, now);
  const sources = turnSources(state.lookups);
  const { replyAt, changeAt } = state.timing;
  const wrote = replyAt !== null || changeAt !== null;
  const steps: ProgressStep[] = [];
  if (sources.length > 0) {
    const reading = phase.kind === 'reading';
    steps.push({
      key: 'read',
      label: STEP_LABEL.read,
      state: reading ? 'running' : 'done',
      sub: sourcesSub(sources, true),
      time: reading ? undefined : formatElapsed(clock.readMs),
    });
  } else if (phase.kind === 'starting') {
    steps.push({ key: 'read', label: STEP_LABEL.read, state: 'pending' });
  }
  const thinkState: StepState = wrote ? 'done' : phase.kind === 'thinking' ? 'running' : 'pending';
  steps.push({ key: 'think', label: STEP_LABEL.think, state: thinkState, time: thinkState === 'done' ? formatElapsed(clock.thinkMs) : undefined });
  const writeState: StepState = replyAt === null ? 'pending' : changeAt !== null ? 'done' : 'running';
  steps.push({ key: 'write', label: STEP_LABEL.write, state: writeState, time: writeState === 'done' && clock.writeMs !== undefined ? formatElapsed(clock.writeMs) : undefined });
  const saving = changeAt !== null;
  steps.push({ key: 'save', label: SAVE_LABEL[mode], state: saving ? 'running' : 'pending', sub: saving ? `${state.changes.length} so far` : undefined });
  return steps;
}

function settledSteps(clock: StepClock, sources: TurnSource[], input: ProgressInput): ProgressStep[] {
  const time = (ms: number | undefined): string | undefined => (ms === undefined ? undefined : formatElapsed(ms));
  return [
    ...(sources.length > 0 ? [{ key: 'read' as const, label: STEP_LABEL.read, state: 'done' as const, sub: sourcesSub(sources, false), time: time(clock.readMs) }] : []),
    { key: 'think', label: STEP_LABEL.think, state: 'done', time: time(clock.thinkMs) },
    { key: 'write', label: STEP_LABEL.write, state: 'done', time: time(clock.writeMs) },
    ...(input.changes > 0
      ? [{ key: 'save' as const, label: SAVE_LABEL[input.mode], state: 'done' as const, sub: plural(input.changes, 'change', 'changes'), time: time(clock.saveMs) }]
      : []),
    ...(input.question ? [{ key: 'ask' as const, label: STEP_LABEL.ask, state: 'done' as const, sub: '1 question' }] : []),
  ];
}

/** A stopped or failed turn keeps the steps it reached; the one it was on carries how it ended, and nothing after it is claimed. */
function endedSteps(state: ChatTurnStreamState, mode: SessionMode, now: number, ending: 'stopped' | 'failed'): ProgressStep[] {
  const reached = liveSteps({ ...state, status: 'streaming' }, mode, now).filter(step => step.state !== 'pending');
  return reached.map((step, index) => (index === reached.length - 1 ? { ...step, state: ending, time: undefined } : step));
}

function settledTrace(turn: PanelTurn): ChatTurnTraceResponse | null | undefined {
  if (turn.kind === 'message') return turn.message.trace;
  return turn.kind === 'stream' && turn.stream.status === 'done' ? turn.stream.turn.assistantMessage.trace : undefined;
}

export function progressView(input: ProgressInput): ProgressView {
  const { turn, mode, now } = input;
  if (turn.kind === 'none') return { status: '', steps: [] };
  const trace = settledTrace(turn);
  if (trace) return { status: `Done · ${formatElapsed(trace.timing.workedMs)}`, steps: settledSteps(trace.timing, turnSources(trace.sources), input) };
  if (turn.kind === 'message') {
    const steps: ProgressStep[] = [
      { key: 'write', label: STEP_LABEL.write, state: 'done' },
      ...(input.changes > 0 ? [{ key: 'save' as const, label: SAVE_LABEL[mode], state: 'done' as const, sub: plural(input.changes, 'change', 'changes') }] : []),
      ...(input.question ? [{ key: 'ask' as const, label: STEP_LABEL.ask, state: 'done' as const, sub: '1 question' }] : []),
    ];
    return { status: 'Done', steps };
  }
  const { stream } = turn;
  const worked = formatElapsed(turnSummary(stream, now).workedMs);
  if (stream.status === 'done') return { status: `Done · ${worked}`, steps: settledSteps(stepClock(stream, now), turnSources(stream.lookups), input) };
  if (stream.status === 'stopped') return { status: `Stopped · ${worked}`, steps: endedSteps(stream, mode, now, 'stopped') };
  if (stream.status === 'failed') return { status: 'Didn’t finish', steps: endedSteps(stream, mode, now, 'failed') };
  const phase = turnPhase(stream, now);
  return { status: phase.kind === 'starting' ? 'Starting' : worked, steps: liveSteps(stream, mode, now) };
}

export type SourcesView = { kind: 'list'; sources: TurnSource[] } | { kind: 'empty'; note: string };

export function sourcesView(turn: PanelTurn): SourcesView {
  if (turn.kind === 'none') return { kind: 'empty', note: 'Nothing yet.' };
  const trace = settledTrace(turn);
  if (trace) return sourceList(turnSources(trace.sources), false);
  if (turn.kind === 'message') return { kind: 'empty', note: 'Sources weren’t kept for this turn.' };
  return sourceList(turnSources(turn.stream.lookups), turn.stream.status === 'idle' || turn.stream.status === 'streaming');
}

function sourceList(sources: TurnSource[], live: boolean): SourcesView {
  if (sources.length > 0) return { kind: 'list', sources };
  return { kind: 'empty', note: live ? 'Nothing read yet.' : 'Nothing needed looking up.' };
}

export const CHANGE_GROUP_LABEL: Record<ChatTurnChangeGroup, string> = {
  premise: 'Premise',
  pages: 'Pages',
  people: 'Characters & factions',
  places: 'Places',
  power: 'Power rules',
  threads: 'Open threads',
  other: 'Other',
};

const GROUP_ORDER = Object.keys(CHANGE_GROUP_LABEL) as ChatTurnChangeGroup[];

const ENTITY_GROUP: Record<string, ChatTurnChangeGroup> = { character: 'people', faction: 'people', location: 'places', power_rule: 'power' };

/** The server's grouping of a streamed change, so a settled row lands in the group its streamed one did. */
export function opChangeGroup(op: ChangeOp): ChatTurnChangeGroup {
  const type = String(op.op);
  if (type === 'premise.update') return 'premise';
  if (type.startsWith('bible_document.')) return 'pages';
  if (type.startsWith('promise.')) return 'threads';
  if (type === 'entity.upsert' && typeof op.type === 'string') return ENTITY_GROUP[op.type] ?? 'other';
  return 'other';
}

export interface ChangeGroupView<T> {
  key: ChatTurnChangeGroup;
  label: string;
  items: T[];
}

export function groupChanges<T extends { group: ChatTurnChangeGroup }>(items: readonly T[]): ChangeGroupView<T>[] {
  return GROUP_ORDER.map(key => ({ key, label: CHANGE_GROUP_LABEL[key], items: items.filter(item => item.group === key) })).filter(group => group.items.length > 0);
}

export interface StreamedPanelChange {
  key: string;
  label: string;
  group: ChatTurnChangeGroup;
}

export interface AppliedPanelChange {
  key: string;
  index: number;
  label: string;
  /** What the change wrote, when it says more than its label: the quote proves the author said the words, not that this is faithful to them. */
  value?: string;
  /** Long enough to clamp, with a way to read the rest. */
  valueLong: boolean;
  group: ChatTurnChangeGroup;
  quote?: string;
  idea: boolean;
  state: 'applied' | 'reverted' | 'failed';
  error?: string;
  /** Undo or redo on its own: only while the turn's proposal stands applied and carries its inverse. */
  actionable: boolean;
}

export type CardState = 'open' | 'add' | 'decline' | 'added' | 'declined' | 'replaced';

export interface CardPanelChange {
  key: string;
  index: number;
  label: string;
  group: ChatTurnChangeGroup;
  state: CardState;
  /** Answerable here: a pending card drawn as suggestions. One-way doors and plans are answered on their own card. */
  decidable: boolean;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const LONG_VALUE = 90;

function writtenValue(op: ChangeOp): Pick<AppliedPanelChange, 'value' | 'valueLong'> {
  const value = opWrittenText(op);
  if (value === opSubject(op)) return { valueLong: false };
  return { value, valueLong: value.length > LONG_VALUE || value.includes('\n') };
}

const APPLIED_STATES: ReadonlySet<string> = new Set(['applied', 'reverted', 'failed']);

export function appliedChanges(proposal: Pick<ProposalResponse, 'id' | 'status' | 'revertible' | 'changeSet' | 'opResults'>): AppliedPanelChange[] {
  const results = new Map((proposal.opResults ?? []).map(result => [result.index, result]));
  const whole = proposal.status === 'reverted';
  return proposal.changeSet.flatMap((op, index) => {
    const result = results.get(index);
    if (isActionOp(op) || (results.size > 0 && !result)) return [];
    const status = result?.status ?? 'applied';
    if (!APPLIED_STATES.has(status)) return [];
    const state = whole && status === 'applied' ? 'reverted' : (status as AppliedPanelChange['state']);
    return [
      {
        key: `${proposal.id}:${index}`,
        index,
        label: opSubject(op),
        ...writtenValue(op),
        group: opChangeGroup(op),
        quote: text(op.quote),
        idea: result?.source === 'idea',
        state,
        error: result?.error,
        actionable: !whole && proposal.status === 'applied' && proposal.revertible && state !== 'failed',
      },
    ];
  });
}

export function cardChanges(
  proposal: Pick<ProposalResponse, 'id' | 'kind' | 'status' | 'changeSet' | 'opResults'>,
  decisions: ReadonlyMap<number, SuggestionDecision>,
): CardPanelChange[] {
  const added = new Set((proposal.opResults ?? []).filter(result => result.status === 'applied').map(result => result.index));
  const decidable = proposal.status === 'pending' && proposalPresentation(proposal) === 'suggestions';
  const settled = (index: number): CardState => {
    if (proposal.status === 'pending') return decisions.get(index) ?? 'open';
    if (proposal.status === 'applied' || proposal.status === 'reverted') return added.has(index) ? 'added' : 'declined';
    return proposal.status === 'discarded' ? 'declined' : 'replaced';
  };
  return proposal.changeSet.map((op, index) => ({ key: `${proposal.id}:${index}`, index, label: opSubject(op), group: opChangeGroup(op), state: settled(index), decidable }));
}

export type ChangesView =
  | { kind: 'empty'; note: string }
  | { kind: 'streamed'; count: string; groups: ChangeGroupView<StreamedPanelChange>[] }
  | { kind: 'settled'; count: string; applied: ChangeGroupView<AppliedPanelChange>[]; cards: ChangeGroupView<CardPanelChange>[]; cardsTitle?: string };

export interface ChangesInput {
  turn: PanelTurn;
  mode: SessionMode;
  applied?: ProposalResponse;
  cards?: ProposalResponse;
  decisions: ReadonlyMap<number, SuggestionDecision>;
}

const WAITING_NOTE: Record<SessionMode, string> = { auto: 'Changes appear here as they’re saved.', manual: 'Changes appear here for you to review.' };

export function changesView({ turn, mode, applied, cards, decisions }: ChangesInput): ChangesView {
  if (turn.kind === 'none') return { kind: 'empty', note: 'Nothing yet.' };
  if (turn.kind === 'stream' && turn.stream.status !== 'done') {
    const { stream } = turn;
    if (stream.status === 'stopped' || stream.status === 'failed') return { kind: 'empty', note: 'This turn ended before its changes were settled.' };
    if (stream.changes.length === 0) return { kind: 'empty', note: WAITING_NOTE[mode] };
    const streamed = stream.changes.map(change => ({ key: String(change.index), label: change.label, group: change.group }));
    return { kind: 'streamed', count: `${stream.changes.length} so far`, groups: groupChanges(streamed) };
  }
  const appliedRows = applied ? appliedChanges(applied) : [];
  const cardRows = cards && cards.kind !== 'chapter_plan' ? cardChanges(cards, decisions) : [];
  if (appliedRows.length === 0 && cardRows.length === 0) return { kind: 'empty', note: 'No Story Bible changes this turn.' };
  const saved = appliedRows.filter(row => row.state === 'applied').length;
  const open = cardRows.filter(row => row.state === 'open').length;
  const count = [...(appliedRows.length > 0 ? [`${saved} saved`] : []), ...(open > 0 ? [`${open} to review`] : [])].join(' · ');
  const cardsTitle = appliedRows.length > 0 && cardRows.length > 0 ? 'Needs your OK' : undefined;
  return { kind: 'settled', count, applied: groupChanges(appliedRows), cards: groupChanges(cardRows), cardsTitle };
}

export type ReceiptView =
  | { kind: 'none' }
  | { kind: 'applied'; title: string; detail: string; canUndoAll: boolean }
  | { kind: 'reverted'; title: string }
  | { kind: 'cards'; tone: 'waiting' | 'settled'; count: number; title: string; detail: string; canAddAll: boolean };

const BREAKDOWN: [ChatTurnChangeGroup[], string, string][] = [
  [['pages'], 'page', 'pages'],
  [['people', 'places', 'power'], 'record', 'records'],
  [['threads'], 'open thread', 'open threads'],
  [['other'], 'other change', 'other changes'],
];

/** "Premise, 5 pages, 16 records, 4 open threads": what a turn saved, by the shape of the Story Bible rather than op by op. */
export function changeBreakdown(changes: readonly Pick<AppliedPanelChange, 'group'>[]): string {
  const parts = changes.some(change => change.group === 'premise') ? ['Premise'] : [];
  for (const [groups, one, many] of BREAKDOWN) {
    const count = changes.filter(change => groups.includes(change.group)).length;
    if (count > 0) parts.push(plural(count, one, many));
  }
  return parts.join(', ');
}

export function appliedReceipt(applied: ProposalResponse, waitingCards: number): ReceiptView {
  if (applied.status === 'reverted') return { kind: 'reverted', title: 'Undone — your Story Bible is back as it was.' };
  const rows = appliedChanges(applied);
  const live = rows.filter(row => row.state === 'applied');
  const undone = rows.filter(row => row.state === 'reverted').length;
  if (rows.length === 0) return { kind: 'none' };
  if (live.length === 0) return { kind: 'reverted', title: undone > 0 ? 'Every change from this turn was undone.' : 'Nothing from this turn could be saved.' };
  const ideas = live.filter(row => row.idea).length;
  const detail = [
    changeBreakdown(live),
    ...(ideas > 0 ? [ideas === 1 ? '1 is Forge’s idea' : `${ideas} are Forge’s ideas`] : []),
    ...(undone > 0 ? [`${undone} undone`] : []),
    ...(waitingCards > 0 ? [waitingCards === 1 ? '1 needs your OK' : `${waitingCards} need your OK`] : []),
  ].join(' · ');
  return {
    kind: 'applied',
    title: `Updated your Story Bible · ${plural(live.length, 'change', 'changes')}`,
    detail,
    canUndoAll: applied.revertible && applied.status === 'applied',
  };
}

export interface CardsReceiptInput {
  decisions: ReadonlyMap<number, SuggestionDecision>;
  committing: boolean;
  error?: string;
}

export function cardsReceipt(cards: ProposalResponse, { decisions, committing, error }: CardsReceiptInput): ReceiptView {
  const presentation = proposalPresentation(cards);
  if (presentation === 'plan' || (presentation === 'legacy' && cards.status === 'pending')) return { kind: 'none' };
  const total = cards.changeSet.length;
  if (cards.status === 'pending') {
    const waiting = total - decisions.size;
    if (waiting > 0)
      return {
        kind: 'cards',
        tone: 'waiting',
        count: waiting,
        title: `${plural(waiting, 'change', 'changes')} waiting for you`,
        detail: 'Nothing is saved until you add it',
        canAddAll: !committing,
      };
    const detail = committing ? 'Adding to your Story Bible…' : error ? `Couldn’t finish: ${error}` : 'Nothing is saved until you add it';
    return { kind: 'cards', tone: 'waiting', count: 0, title: 'All changes answered', detail, canAddAll: false };
  }
  const added = (cards.opResults ?? []).filter(result => result.status === 'applied').length;
  if (cards.status === 'applied' || cards.status === 'reverted') {
    const passed = total - added;
    return {
      kind: 'cards',
      tone: 'settled',
      count: 0,
      title: `Added ${plural(added, 'change', 'changes')} to your Story Bible`,
      detail: passed > 0 ? `Passed on ${passed}` : '',
      canAddAll: false,
    };
  }
  if (cards.status === 'discarded') return { kind: 'cards', tone: 'settled', count: 0, title: 'You passed on these suggestions', detail: '', canAddAll: false };
  return { kind: 'cards', tone: 'settled', count: 0, title: 'Replaced before anything was added', detail: '', canAddAll: false };
}

export interface OpPrompt {
  lead: string;
  confirm: string;
}

const quoted = (labels: readonly string[]): string => labels.map(label => `“${label}”`).join(', ');

const DONE_VERB: Record<ProposalOpDirection, string> = { undo: 'undone', redo: 'redone' };

function alreadyMoved(direction: ProposalOpDirection, moved: readonly string[]): string {
  if (moved.length === 0) return '';
  return ` ${quoted(moved)} ${moved.length === 1 ? 'was' : 'were'} already ${DONE_VERB[direction]}.`;
}

/** RFN_015 / RFN_016: the author takes back only what they chose, so the other changes are named and moved only on a second click. */
export function opDependencyPrompt(direction: ProposalOpDirection, labels: readonly string[], moved: readonly string[] = []): OpPrompt {
  const count = labels.length + 1;
  if (direction === 'undo') return { lead: `Other changes rely on it. Undo these too: ${quoted(labels)}.${alreadyMoved(direction, moved)}`, confirm: `Undo these ${count}` };
  return { lead: `It relies on changes that are undone. Redo these first: ${quoted(labels)}.${alreadyMoved(direction, moved)}`, confirm: `Redo these ${count}` };
}

export type OpSequenceResult = { kind: 'done' } | { kind: 'blocked'; before: number[]; moved: number[] } | { kind: 'failed'; at: number; moved: number[]; error: unknown };

/**
 * Moves `steps` in order, the chosen change last. A step refused for its own dependencies hands back those dependencies merged ahead of the
 * steps still to go, so nothing the author already agreed to is dropped; a failure names the step it happened at and what had already moved.
 */
export async function runOpSequence(send: (opIndex: number) => Promise<ProposalOpOutcome>, steps: readonly number[]): Promise<OpSequenceResult> {
  const target = steps.at(-1);
  for (const [position, step] of steps.entries()) {
    const moved = steps.slice(0, position);
    let outcome: ProposalOpOutcome;
    try {
      outcome = await send(step);
    } catch (error) {
      return { kind: 'failed', at: step, moved, error };
    }
    if (outcome.kind === 'blocked') {
      const before = [...new Set([...outcome.opIndexes, ...steps.slice(position, -1)])].filter(index => index !== target && !moved.includes(index));
      return { kind: 'blocked', before, moved };
    }
  }
  return { kind: 'done' };
}

/** The chosen change's note when a step ahead of it failed: the failing row carries the reason itself. */
export function opSequenceStopped(direction: ProposalOpDirection, failed: string, moved: readonly string[]): string {
  return `Stopped at “${failed}”, so this wasn’t ${DONE_VERB[direction]}.${alreadyMoved(direction, moved)}`;
}

const OP_ERRORS: Record<string, string> = {
  RFN_014: 'This change can’t be taken back on its own.',
  RFN_017: 'The whole turn was undone, so this change can’t be redone on its own.',
  RFN_003: 'Its record changed since, so it can’t be switched back here.',
  RFN_006: 'Its record changed since, so it can’t be switched back here.',
  RFN_018: 'It couldn’t be switched back cleanly, so nothing was changed.',
};

export function opErrorText(code: string, message: string): string {
  return OP_ERRORS[code] ?? message;
}
