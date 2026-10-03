import { type ChatMessageResponse, type ChatTurnTraceResponse, type ProposalResponse, type TurnHoldReason } from '@/lib/apis/api-types.gen';
import { type ChatJobState, type OrganiseCardEntry, type OrganiseEntryLabel, type OrganiseReceipt } from '@/lib/apis/chat.api';
import { type ChatTurnChangeGroup, type ChatTurnStreamState, type ProposalOpDirection, type ProposalOpOutcome } from '@/lib/apis/refinement.api';
import { type TurnSource, turnSources } from '@/lib/chat-turn-timeline';
import { type ChangeOp } from '@/lib/proposals';

import {
  answeredInPanel,
  commitBarView,
  isActionOp,
  opSubject,
  opWrittenText,
  proposalPresentation,
  type RejectionScope,
  rejectionScopesFor,
  type SessionMode,
  type SuggestionDecision,
} from './chat-view';

/** What a finished job left for the author — an organise round's applied changes and card — or a card no reply carries. */
export interface PanelProposals {
  key: string;
  appliedProposalId?: string;
  proposalId?: string;
  organised?: OrganiseReceipt;
  /** The ordinal of the reply it came after; without one the panel shows it only when its receipt asks. */
  after?: number;
}

/** The turn the panel follows: the one running, one this tab watched settle, one from the transcript, or a job's changes. */
export type PanelTurn =
  { kind: 'none' } | { kind: 'stream'; stream: ChatTurnStreamState } | { kind: 'message'; message: ChatMessageResponse } | { kind: 'proposals'; proposals: PanelProposals };

export interface PanelTurnInput {
  stream: ChatTurnStreamState;
  /** The transcript is still drawing the stream rather than the saved reply: running, stopped, failed, or done but not yet refetched. */
  streamShown: boolean;
  messages: readonly ChatMessageResponse[];
  /** A reply or a job's changes the author asked to review from its receipt; otherwise the panel follows the latest turn. */
  focus?: string;
  proposals?: readonly PanelProposals[];
}

function hasChanges(message: ChatMessageResponse): boolean {
  return Boolean(message.appliedProposalId || message.proposalId);
}

/** A job's changes, once it has finished with any. A plan has its own card in the thread. */
export function jobProposals(job: ChatJobState, after: number | undefined): PanelProposals | undefined {
  const { appliedProposalId, proposalId, organised } = job.progress;
  if (job.status !== 'done' || job.kind === 'plan' || !(appliedProposalId || proposalId)) return undefined;
  return { key: job.id, appliedProposalId, proposalId, organised, after };
}

function latestFollowed(proposals: readonly PanelProposals[]): PanelProposals | undefined {
  let latest: PanelProposals | undefined;
  for (const entry of proposals) if (entry.after !== undefined && (latest?.after === undefined || entry.after >= latest.after)) latest = entry;
  return latest;
}

export function panelTurnOf({ stream, streamShown, messages, focus, proposals = [] }: PanelTurnInput): PanelTurn {
  const watched = stream.status === 'done' ? stream.turn.assistantMessage.id : undefined;
  const focused = focus ? messages.find(message => message.id === focus && message.role === 'assistant') : undefined;
  if (focused) return focused.id === watched ? { kind: 'stream', stream } : { kind: 'message', message: focused };
  const asked = focus ? proposals.find(entry => entry.key === focus) : undefined;
  if (asked) return { kind: 'proposals', proposals: asked };
  if (streamShown) return { kind: 'stream', stream };
  const replies = messages.filter(message => message.role === 'assistant');
  const last = replies.at(-1);
  const latest = watched && last?.id === watched ? last : [...replies].reverse().find(hasChanges);
  const job = latestFollowed(proposals);
  if (job?.after !== undefined && (!latest || job.after >= latest.ordinal)) return { kind: 'proposals', proposals: job };
  if (!latest) return { kind: 'none' };
  return latest.id === watched ? { kind: 'stream', stream } : { kind: 'message', message: latest };
}

/** Closed until a turn leaves changes waiting for the author's OK; closing it keeps those changes from reopening it, and newer ones still do. */
export type DockState = { kind: 'closed'; dismissed?: string } | { kind: 'open' };

export function dockState(state: DockState, reviewCardsId: string | undefined): DockState {
  if (state.kind === 'open' || !reviewCardsId || state.dismissed === reviewCardsId) return state;
  return { kind: 'open' };
}

export interface TurnRefs {
  messageId?: string;
  appliedProposalId?: string;
  proposalId?: string;
  /** The settled turn's own copies, shown until the proposal queries answer. */
  applied?: ProposalResponse;
  cards?: ProposalResponse;
  organised?: OrganiseReceipt;
}

export function turnRefs(turn: PanelTurn): TurnRefs {
  if (turn.kind === 'none') return {};
  if (turn.kind === 'proposals') {
    const { appliedProposalId, proposalId, organised } = turn.proposals;
    return { appliedProposalId, proposalId, organised };
  }
  if (turn.kind === 'message') {
    const { message } = turn;
    return {
      messageId: message.id,
      appliedProposalId: message.appliedProposalId ?? undefined,
      proposalId: message.proposalId ?? undefined,
    };
  }
  if (turn.stream.status !== 'done') return {};
  const { assistantMessage, appliedProposal, proposal } = turn.stream.turn;
  return {
    messageId: assistantMessage.id,
    appliedProposalId: appliedProposal?.id ?? assistantMessage.appliedProposalId ?? undefined,
    proposalId: proposal?.id ?? assistantMessage.proposalId ?? undefined,
    applied: appliedProposal,
    cards: proposal,
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function settledTrace(turn: PanelTurn): ChatTurnTraceResponse | null | undefined {
  if (turn.kind === 'message') return turn.message.trace;
  return turn.kind === 'stream' && turn.stream.status === 'done' ? turn.stream.turn.assistantMessage.trace : undefined;
}

export type SourcesView = { kind: 'list'; sources: TurnSource[] } | { kind: 'empty'; note: string };

export function sourcesView(turn: PanelTurn): SourcesView {
  if (turn.kind === 'none') return { kind: 'empty', note: 'Nothing yet.' };
  if (turn.kind === 'proposals') {
    const { organised } = turn.proposals;
    if (!organised) return { kind: 'empty', note: 'Sources aren’t kept for this step.' };
    return { kind: 'list', sources: [{ key: 'notes', tool: 'get_notes', label: `Your notes · ${plural(organised.paragraphs, 'paragraph', 'paragraphs')}`, status: 'ok' }] };
  }
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
  premise: 'The story',
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
  /** Where its words came from — the author's message, or the notes paragraphs an organise round read. */
  cite?: string;
  idea: boolean;
  state: 'applied' | 'reverted' | 'failed';
  error?: string;
  /** Undo or redo on its own: only while the turn's proposal stands applied and carries its inverse. */
  actionable: boolean;
}

export type CardState = 'open' | 'add' | 'decline' | 'added' | 'undone' | 'declined' | 'replaced';

export interface CardPanelChange {
  key: string;
  index: number;
  label: string;
  /** What the suggestion would write, when it says more than its label. */
  value?: string;
  valueLong: boolean;
  group: ChatTurnChangeGroup;
  cite?: string;
  /** How an organise round labelled it: not in the notes, planner-only, or a rule. */
  tag?: string;
  note?: string;
  state: CardState;
  /** False for actions, prose, plan edits and plans, which are answered on their own card in the thread. */
  decidable: boolean;
  /** The scopes to offer for a decline the author has not yet said when to suggest again; empty when there is nothing to ask. */
  askScope: readonly RejectionScope[];
  scope?: RejectionScope;
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

function citation(kind: string, op: ChangeOp, entry: OrganiseCardEntry | undefined): string | undefined {
  const quote = text(op.quote);
  if (kind !== 'organise') return quote && `from your message: “${quote}”`;
  const cited = entry?.paragraphs.length ? `, ${entry.paragraphs.map(number => `¶${number}`).join(', ')}` : '';
  if (quote) return `from your notes${cited}: “${quote}”`;
  return cited ? `from your notes${cited}` : undefined;
}

function entriesByOp(entries: readonly OrganiseCardEntry[]): Map<number, OrganiseCardEntry> {
  return new Map(entries.map(entry => [entry.opIndex, entry]));
}

const ENTRY_TAG: Partial<Record<OrganiseEntryLabel, string>> = { suggested: 'not in your notes', planner_only: 'planner-only', rule: 'rule' };

const RETIRED_NOTE = 'Takes out an earlier organise entry';
const RETIRES_NOTE = 'Already in your Notebook — declining it takes it out.';

function entryNote(entry: OrganiseCardEntry | undefined): string | undefined {
  if (entry?.label === 'retired') return RETIRED_NOTE;
  return entry?.retires?.length ? RETIRES_NOTE : undefined;
}

/** The suggestions an organise round made up rather than found in the notes: Forge's ideas, as a turn's are. */
export function organiseIdeas(organised: OrganiseReceipt | undefined): ReadonlySet<number> {
  return new Set((organised?.card ?? []).filter(entry => entry.label === 'suggested').map(entry => entry.opIndex));
}

const APPLIED_STATES: ReadonlySet<string> = new Set(['applied', 'reverted', 'failed']);

export function appliedChanges(
  proposal: Pick<ProposalResponse, 'id' | 'kind' | 'status' | 'revertible' | 'changeSet' | 'opResults'>,
  entries: readonly OrganiseCardEntry[] = [],
): AppliedPanelChange[] {
  const results = new Map((proposal.opResults ?? []).map(result => [result.index, result]));
  const cited = entriesByOp(entries);
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
        cite: citation(proposal.kind, op, cited.get(index)),
        idea: result?.source === 'idea',
        state,
        error: result?.error,
        actionable: !whole && proposal.status === 'applied' && proposal.revertible && state !== 'failed',
      },
    ];
  });
}

const REMEMBERED_STATES: ReadonlySet<CardState> = new Set(['decline', 'declined']);

export function cardChanges(
  proposal: Pick<ProposalResponse, 'id' | 'kind' | 'status' | 'changeSet' | 'opResults'>,
  decisions: ReadonlyMap<number, SuggestionDecision>,
  scopes: ReadonlyMap<number, RejectionScope> = new Map(),
  entries: readonly OrganiseCardEntry[] = [],
): CardPanelChange[] {
  const added = new Set((proposal.opResults ?? []).filter(result => result.status === 'applied').map(result => result.index));
  const labelled = entriesByOp(entries);
  const inPanel = answeredInPanel(proposal);
  const decidable = inPanel && proposal.status === 'pending' && proposalPresentation(proposal) === 'suggestions';
  const settled = (index: number): CardState => {
    if (proposal.status === 'pending') return decisions.get(index) ?? 'open';
    if (proposal.status === 'applied') return added.has(index) ? 'added' : 'declined';
    if (proposal.status === 'reverted') return added.has(index) ? 'undone' : 'declined';
    return proposal.status === 'discarded' ? 'declined' : 'replaced';
  };
  return proposal.changeSet.flatMap((op, index) => {
    if (isActionOp(op)) return [];
    const state = settled(index);
    const scope = scopes.get(index);
    const asked = inPanel && !scope && REMEMBERED_STATES.has(state) && decisions.get(index) === 'decline';
    const entry = labelled.get(index);
    return [
      {
        key: `${proposal.id}:${index}`,
        index,
        label: opSubject(op),
        ...writtenValue(op),
        group: opChangeGroup(op),
        cite: citation(proposal.kind, op, entry),
        tag: entry && ENTRY_TAG[entry.label],
        note: entryNote(entry),
        state,
        decidable,
        askScope: asked ? rejectionScopesFor(op) : [],
        scope,
      },
    ];
  });
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
  scopes?: ReadonlyMap<number, RejectionScope>;
  organised?: OrganiseReceipt;
}

const WAITING_NOTE: Record<SessionMode, string> = { auto: 'Changes appear here as they’re saved.', manual: 'Changes appear here for you to review.' };

export function changesView({ turn, mode, applied, cards, decisions, scopes, organised }: ChangesInput): ChangesView {
  if (turn.kind === 'none') return { kind: 'empty', note: 'Nothing yet.' };
  if (turn.kind === 'stream' && turn.stream.status !== 'done') {
    const { stream } = turn;
    if (stream.status === 'stopped' || stream.status === 'failed') return { kind: 'empty', note: 'This turn ended before its changes were settled.' };
    if (stream.changes.length === 0) return { kind: 'empty', note: WAITING_NOTE[mode] };
    const streamed = stream.changes.map(change => ({ key: String(change.index), label: change.label, group: change.group }));
    return { kind: 'streamed', count: `${stream.changes.length} so far`, groups: groupChanges(streamed) };
  }
  const appliedRows = applied ? appliedChanges(applied, organised?.applied) : [];
  const cardRows = cards && cards.kind !== 'chapter_plan' ? cardChanges(cards, decisions, scopes, organised?.card) : [];
  if (appliedRows.length === 0 && cardRows.length === 0)
    return { kind: 'empty', note: turn.kind === 'proposals' ? 'No Story Bible changes.' : 'No Story Bible changes this turn.' };
  const saved = appliedRows.filter(row => row.state === 'applied').length;
  const open = cardRows.filter(row => row.state === 'open').length;
  const count = [...(appliedRows.length > 0 ? [`${saved} saved`] : []), ...(open > 0 ? [`${open} to review`] : [])].join(' · ');
  const cardsTitle = appliedRows.length > 0 && cardRows.length > 0 ? 'Needs your OK' : undefined;
  return { kind: 'settled', count, applied: groupChanges(appliedRows), cards: groupChanges(cardRows), cardsTitle };
}

export type ReceiptView =
  | { kind: 'none' }
  | { kind: 'applied'; title: string; detail: string; canUndoAll: boolean; canAddAll: boolean; commit?: string; hold?: string }
  | { kind: 'reverted'; title: string }
  | { kind: 'cards'; tone: 'waiting' | 'settled'; count: number; title: string; detail: string; canAddAll: boolean; commit?: string; hold?: string };

const BREAKDOWN: [ChatTurnChangeGroup[], string, string][] = [
  [['pages'], 'page', 'pages'],
  [['people', 'places', 'power'], 'record', 'records'],
  [['threads'], 'open thread', 'open threads'],
  [['other'], 'other change', 'other changes'],
];

/** "The story, 5 pages, 16 records, 4 open threads": what a turn saved, by the shape of the Story Bible rather than op by op. */
export function changeBreakdown(changes: readonly Pick<AppliedPanelChange, 'group'>[]): string {
  const parts = changes.some(change => change.group === 'premise') ? ['The story'] : [];
  for (const [groups, one, many] of BREAKDOWN) {
    const count = changes.filter(change => groups.includes(change.group)).length;
    if (count > 0) parts.push(plural(count, one, many));
  }
  return parts.join(', ');
}

/** A turn's saved proposals, newest first: suggestions the author added from the panel, then what the turn saved on its own. */
export function savedSides(applied: ProposalResponse | undefined, cards: ProposalResponse | undefined): ProposalResponse[] {
  const added = cards && (cards.status === 'applied' || cards.status === 'reverted') && answeredInPanel(cards) ? [cards] : [];
  return [...added, ...(applied ? [applied] : [])];
}

function ideasPhrase(count: number): string {
  return count === 1 ? '1 is Forge’s idea' : `${count} are Forge’s ideas`;
}

export function appliedReceipt(sides: readonly ProposalResponse[], waitingCards: number, waitingIdeas = 0): ReceiptView {
  if (sides.length === 0) return { kind: 'none' };
  if (sides.every(side => side.status === 'reverted')) return { kind: 'reverted', title: 'Undone — your Story Bible is back as it was.' };
  const rows = sides.flatMap(side => appliedChanges(side));
  const live = rows.filter(row => row.state === 'applied');
  const undone = rows.filter(row => row.state === 'reverted').length;
  if (rows.length === 0) return { kind: 'none' };
  if (live.length === 0) return { kind: 'reverted', title: undone > 0 ? 'Every change from this turn was undone.' : 'Nothing from this turn could be saved.' };
  const ideas = live.filter(row => row.idea).length;
  const passed = sides.filter(side => !side.autoApplied).reduce((sum, side) => sum + side.changeSet.length - appliedChanges(side).length, 0);
  const standing = sides.filter(side => side.status === 'applied');
  const detail = [
    changeBreakdown(live),
    ...(ideas > 0 ? [ideasPhrase(ideas)] : []),
    ...(undone > 0 ? [`${undone} undone`] : []),
    ...(passed > 0 ? [`passed on ${passed}`] : []),
    ...(waitingCards > 0
      ? [
          `${waitingCards === 1 ? '1 needs your OK' : `${waitingCards} need your OK`}${waitingIdeas > 0 ? `, ${waitingIdeas} of them Forge’s ${waitingIdeas === 1 ? 'idea' : 'ideas'}` : ''}`,
        ]
      : []),
  ].join(' · ');
  return {
    kind: 'applied',
    title: `Updated your Story Bible · ${plural(live.length, 'change', 'changes')}`,
    detail,
    canUndoAll: standing.length > 0 && standing.every(side => side.revertible),
    canAddAll: false,
  };
}

export interface CardsReceiptInput {
  decisions: ReadonlyMap<number, SuggestionDecision>;
  committing: boolean;
  error?: string;
}

/** Owed after a failed add, or by answers kept across a reload. */
function owedCommit(cards: ProposalResponse, { decisions, committing, error }: CardsReceiptInput): { commit?: string } {
  const bar = commitBarView({ total: cards.changeSet.length, decisions, committing, error });
  return bar.kind === 'ready' ? { commit: bar.action } : {};
}

function answeredDetail({ committing, error }: CardsReceiptInput): string {
  if (committing) return 'Adding to your Story Bible…';
  return error ? `Couldn’t finish: ${error}` : 'Nothing is saved until you add it';
}

/** The indexes of a card's Story Bible changes: an action it runs is not one, and its job reports itself. */
function storyIndexes(cards: Pick<ProposalResponse, 'changeSet'>): number[] {
  return cards.changeSet.flatMap((op, index) => (isActionOp(op) ? [] : [index]));
}

function undecided(indexes: Iterable<number>, decisions: ReadonlyMap<number, SuggestionDecision>): number {
  return [...indexes].filter(index => !decisions.has(index)).length;
}

export function cardsReceipt(cards: ProposalResponse, answers: CardsReceiptInput, ideas: ReadonlySet<number> = new Set()): ReceiptView {
  const presentation = proposalPresentation(cards);
  if (presentation === 'plan' || (cards.status === 'pending' && !answeredInPanel(cards))) return { kind: 'none' };
  const story = storyIndexes(cards);
  const total = story.length;
  if (total === 0) return { kind: 'none' };
  if (cards.status === 'pending') {
    const waiting = undecided(story, answers.decisions);
    const waitingIdeas = undecided(ideas, answers.decisions);
    if (waiting > 0)
      return {
        kind: 'cards',
        tone: 'waiting',
        count: waiting,
        title: `${plural(waiting, 'change', 'changes')} waiting for you`,
        detail: [...(waitingIdeas > 0 ? [ideasPhrase(waitingIdeas)] : []), 'Nothing is saved until you add it'].join(' · '),
        canAddAll: !answers.committing,
      };
    return { kind: 'cards', tone: 'waiting', count: 0, title: 'All changes answered', detail: answeredDetail(answers), canAddAll: false, ...owedCommit(cards, answers) };
  }
  const kept = new Set(story);
  const added = (cards.opResults ?? []).filter(result => result.status === 'applied' && kept.has(result.index)).length;
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

const HOLD_LINE: Record<TurnHoldReason, string> = {
  planner_sources: 'Held for review: this turn drew on your notes, so changes your chapters or readers would see wait for you.',
  warnings: 'Held for review: check the warnings on these first.',
};

/** A reloaded turn has no typed reason, so it falls back to the card's own warnings. */
export function holdLine(cards: Pick<ProposalResponse, 'warnings'>, held: TurnHoldReason | undefined): string | undefined {
  const warnings = cards.warnings.join(' ');
  if (held === 'planner_sources') return HOLD_LINE.planner_sources;
  if (held === 'warnings') return warnings ? `Held for review: ${warnings}` : HOLD_LINE.warnings;
  return warnings || undefined;
}

export interface TurnReceiptInput {
  applied?: ProposalResponse;
  cards?: ProposalResponse;
  answers: CardsReceiptInput;
  held?: TurnHoldReason;
  /** The card's ops that are Forge's ideas rather than the author's words, where only the receipt knows it (an organise round's). */
  ideas?: ReadonlySet<number>;
  /** Why something resting on the author's words was carded instead of applied. */
  note?: string;
}

export function turnReceipt(input: TurnReceiptInput): ReceiptView {
  const view = receiptOf(input);
  if (!input.note || (view.kind !== 'applied' && view.kind !== 'cards')) return view;
  return { ...view, hold: [view.hold, input.note].filter(Boolean).join(' ') };
}

function receiptOf({ applied, cards, answers, held, ideas = new Set() }: TurnReceiptInput): ReceiptView {
  const pending = cards?.status === 'pending' && cards.kind !== 'chapter_plan' ? cards : undefined;
  const waiting = pending ? undecided(storyIndexes(pending), answers.decisions) : 0;
  const panelCards = pending && answeredInPanel(pending) ? pending : undefined;
  const hold = panelCards && waiting > 0 ? holdLine(panelCards, held) : undefined;
  const saved = appliedReceipt(savedSides(applied, cards), waiting, panelCards ? undecided(ideas, answers.decisions) : 0);
  if (saved.kind === 'applied') {
    if (!panelCards) return saved;
    if (waiting > 0) return { ...saved, canAddAll: !answers.committing, ...(hold && { hold }) };
    const owed = answers.committing || answers.error ? [answeredDetail(answers)] : [];
    return { ...saved, detail: [saved.detail, ...owed].join(' · '), ...owedCommit(panelCards, answers) };
  }
  if (saved.kind === 'reverted' && !panelCards) return saved;
  const carded = cards ? cardsReceipt(cards, answers, ideas) : ({ kind: 'none' } as const);
  if (carded.kind === 'cards') return { ...carded, ...(hold && { hold }) };
  return saved.kind === 'none' ? carded : saved;
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
