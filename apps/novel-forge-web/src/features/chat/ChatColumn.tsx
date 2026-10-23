import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, ChevronDownIcon, PlusIcon, toast, useMediaQuery } from '@shadow-library/ui';

import { ClockIcon, CloseIcon, EditIcon, ProposalsIcon } from '@/components/icons';
import { PaneError, PaneLoader, StatusChip, TurnStatus } from '@/components/nf';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import { Markdown } from '@/components/nf/Markdown';
import { ChatPlanCard, PlanStart } from '@/features/plan-card';
import {
  type ApiError,
  type ApplyProposalResponse,
  type ChatJobState,
  type ChatJobStreamStatus,
  type ChatMessageResponse,
  type ChatSessionResponse,
  type ChatTurnResponse,
  draftQueryOptions,
  invalidateDraft,
  invalidateProgress,
  isTurnFailureRecorded,
  type JobEnqueueResponse,
  jobSettled,
  type ProgressItemKey,
  type ProgressOverrideStatus,
  type ProposalResponse,
  transcriptTurnState,
  type TurnHoldReason,
  useAdoptProposalMutation,
  useAuthorNotesQuery,
  useCancelChatJobMutation,
  useChatJobStream,
  useChatMessagesQuery,
  useChatTurnStream,
  useContinuityProposalsQuery,
  useFinalizeReviewsQuery,
  useListProposalsQuery,
  useProgressOverrideMutation,
  useProgressQuery,
  useProjectQuery,
  useProjectStatusQuery,
  useProposalQuery,
  useStartNextDraftMutation,
  useUpdateChatSessionMutation,
  useUpdateSessionModelMutation,
} from '@/lib/apis';
import { CHAPTER_SHEET_QUERY, type ChapterOpenMode, draftCardShape } from '@/lib/chapter-panel';
import { chatChoiceUpdate, sameChoice, type TurnChoice, turnChoiceDefaults, turnOverride } from '@/lib/chat-model';
import { chatColumnView, chatTitle } from '@/lib/chat-sessions';
import { timelineOfTrace, turnTimeline } from '@/lib/chat-turn-timeline';
import { messageTime, projectTitle } from '@/lib/format';
import { chipContexts, chipLimitReason, type ChipReveal, chipsOfSent, nextReveal, type PassageChip, rewriteChip, shownContexts, staleChipIds } from '@/lib/passage-comments';
import { PANEL_DOCK_MIN } from '@/lib/sidebar-rail';
import { type PendingItem, pendingKey } from '@/lib/pending-items';
import { useGenerationActivity } from '@/lib/use-generation-activity';

import { ChapterDraftCard } from './ChapterDraftCard';
import { ChapterPanel, type PanelComments } from './ChapterPanel';
import { type CommentFollowUp } from './ChapterReader';
import { afterFailedSend, inputCaption, type QueuedTurn, queuedView, type TurnSettings } from './chat-queue';
import { ChatComposer } from './ChatComposer';
import { NotesChip, SaveAsNotesOffer } from './ChatExtras';
import { ContinuityProposalCard } from './ContinuityProposalCard';
import { FinalizeDecisionsCard } from './FinalizeDecisionsCard';
import { hiddenReceipts, hideReceipt } from './hidden-receipts';
import {
  answeredInPanel,
  applyNoteToast,
  awaitingAnswer,
  checklistView,
  composerChips,
  type ComposerMode,
  composerModeChange,
  composerModeOf,
  heroText,
  jobKindForOp,
  jobView,
  lastUserOrdinal,
  notesOpenerId,
  offersNotes,
  openerChip,
  type PromptChip,
  promptChips,
  questionEyebrow,
  questionOf,
  type QuestionOption,
  type SessionMode,
  shouldRefocusComposer,
  turnAnnouncement,
  turnCardsInline,
  type TurnOutcome,
  unansweredWarning,
  unusedParagraphPrompt,
  writingView,
} from './chat-view';
import styles from './Chat.module.css';
import { ComposerModeMenu } from './ComposerModeMenu';
import { JobProgress } from './JobProgress';
import { ComposerPassages, SentPassages } from './PassageChips';
import { ProgressDock, ProgressDockStrip } from './ProgressPanel';
import { type DockState, dockState, jobProposals, organiseIdeas, type PanelProposals, panelTurnOf, turnRefs } from './progress-panel-view';
import { QuestionCard } from './QuestionCard';
import { ReadyChecklist } from './ReadyChecklist';
import { RenameInput } from './RenameInput';
import { StoryBibleReceiptCard } from './StoryBibleReceiptCard';
import { LiveStreamedTurn } from './StreamedTurn';
import { useUnansweredCount } from './suggestion-store';
import { TurnProposalCard } from './TurnProposalCard';
import { TurnReceipt } from './TurnReceipt';
import { TurnTrace } from './TurnTimeline';
import { useJobAnnouncements, useLiveAnnouncer } from './use-live-announcer';
import { useOpeningTurn } from './use-opening-turn';
import { usePassageChips } from './use-passage-chips';
import { PENDING_PROPOSAL_LIMIT, usePendingItems } from './use-pending-items';
import { useRevealPending } from './use-reveal-pending';
import { useTurnQueue } from './use-turn-queue';
import { PendingAnchor, WaitingTray } from './WaitingTray';

const PLAN_KIND = 'chapter_plan';
const NO_JOBS: readonly ChatJobState[] = [];
const NO_PROPOSALS: readonly ProposalResponse[] = [];
// The server refuses these before the turn starts, naming a passage the author has to select again or take out.
const PASSAGE_REFUSALS = new Set(['CHT_009', 'CHT_010', 'CHT_011']);

export interface ChatColumnProps {
  novelId: string;
  /** Absent until the first message creates one — the centred state, not a different screen. */
  session?: ChatSessionResponse;
  onOpenHistory: () => void;
  onOpenChanges: () => void;
  onNewChat: () => void;
  onStart: (content: string, mode: SessionMode) => void;
  // True while the session create this column handed off is in flight — locks the composer so a second
  // Enter or Send click can't spawn a second session from the same opening message.
  starting: boolean;
  // The just-created session's first message, queued by the screen — the one place a turn is sent
  // without the author touching this column's own composer.
  initialTurn?: string;
  onInitialTurnSent?: () => void;
  /** A pending card another screen sent the author here to answer. */
  revealCard?: string;
  /** Brings a card into a chat that does not exist yet: the screen creates one, then hands the card back through `revealCard`. */
  onStartForCard: (proposalId: string) => void;
  onCardRevealed?: () => void;
  /** The chapter open in the panel beside the chat. */
  chapter?: number;
  /** How the author's click asked for that chapter; absent when the URL alone opened it. */
  chapterRequest?: ChapterOpenMode;
  onOpenChapter: (chapter: number, mode: ChapterOpenMode) => void;
  onCloseChapter: () => void;
}

/** Everything a transcript row can ask the column to do; one stable object, so memoised rows do not re-render on every keystroke. */
interface TranscriptActions {
  sendTurn: (content: string, draft?: string) => void;
  onApplied: (result: ApplyProposalResponse) => void;
  onWriting: (job: JobEnqueueResponse) => void;
  cancelJob: (jobId: string) => void;
  answer: (option: QuestionOption) => void;
  leaveUndecided: (key: ProgressItemKey | undefined) => void;
  focusComposer: () => void;
  /** A reply's id, or the key of a job's changes. */
  reviewInPanel: (key: string) => void;
}

function lastAssistantOrdinal(messages: ChatMessageResponse[]): number {
  return messages.reduce((ordinal, message) => (message.role === 'assistant' ? Math.max(ordinal, message.ordinal) : ordinal), 0);
}

function turnOutcome(turn: ChatTurnResponse): TurnOutcome {
  const applied = turn.applied?.opResults.filter(op => op.status === 'applied').length ?? turn.appliedProposal?.changeSet.length ?? 0;
  return { applied, suggested: turn.proposal?.changeSet.length ?? 0, failed: false };
}

function isPlanJob(job: ChatJobState): boolean {
  return job.kind === 'plan' && job.status === 'done' && Boolean(job.progress.proposalId);
}

/**
 * The conversation, in its two states. Centred while there is nothing in it, transcript-above-composer
 * once there is — one tree either way, so the draft, the focus and the model picker survive the move.
 */
export function ChatColumn(props: ChatColumnProps): React.JSX.Element {
  const { novelId, session, starting, initialTurn, onInitialTurnSent, chapter } = props;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);
  const messagesQuery = useChatMessagesQuery(novelId, session?.id);
  const progressQuery = useProgressQuery(novelId);
  const notesQuery = useAuthorNotesQuery(novelId);
  const proposalsQuery = useListProposalsQuery(novelId, { status: 'pending', limit: PENDING_PROPOSAL_LIMIT });
  const progressOverride = useProgressOverrideMutation(novelId);
  const jobStream = useChatJobStream(novelId, session?.id);
  const cancelJobMutation = useCancelChatJobMutation(novelId, session?.id);
  const turn = useChatTurnStream(novelId, session?.id ?? '');
  const updateSession = useUpdateChatSessionMutation(novelId);
  const saveChatChoice = useUpdateSessionModelMutation(novelId);
  const generation = useGenerationActivity(novelId);
  const continuityQuery = useContinuityProposalsQuery(novelId);
  const finalizeReviewsQuery = useFinalizeReviewsQuery(novelId);
  const startNextDraft = useStartNextDraftMutation(novelId);
  const adoptProposal = useAdoptProposalMutation(novelId);
  const unanswered = useUnansweredCount();
  const narrow = useMediaQuery(CHAPTER_SHEET_QUERY);

  const [input, setInput] = useState('');
  const [proseEdits, setProseEdits] = useState(false);
  const [justDiscussing, setJustDiscussing] = useState(false);
  const [draftMode, setDraftMode] = useState<SessionMode>('auto');
  const [turnChoice, setTurnChoice] = useState<TurnChoice>();
  const [renamingHeader, setRenamingHeader] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [planStartOpen, setPlanStartOpen] = useState(false);
  const [cancellingJob, setCancellingJob] = useState<string>();
  const [hiddenBibleReceipts, setHiddenBibleReceipts] = useState(hiddenReceipts);
  // Where the transcript's assistant messages stood when this tab's turn began; the turn's own reply is the first one past it.
  const [assistantWatermark, setAssistantWatermark] = useState(0);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  // The reply whose receipt asked for review; unset, the panel follows the latest turn.
  const [panelFocus, setPanelFocus] = useState<string>();
  const [panelReveal, setPanelReveal] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetReveals, setSheetReveals] = useState(false);
  const [dock, setDock] = useState<DockState>({ kind: 'closed' });
  const [chipReveal, setChipReveal] = useState<ChipReveal>();
  const revealCount = useRef(0);
  const passages = usePassageChips(novelId, session?.id);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => messagesQuery.data?.messages ?? [], [messagesQuery.data]);
  const project = projectQuery.data;
  const mode = session?.mode ?? draftMode;
  const name = project ? projectTitle(project) : 'this novel';
  const notes = notesQuery.data?.notes;
  const nextChapter = (statusQuery.data?.draftsTotal ?? 0) + 1;
  const checklist = progressQuery.data ? checklistView(progressQuery.data.items) : undefined;
  const state = transcriptTurnState(messagesQuery);
  const stream = turn.stream;
  // Once this tab has stopped its own turn, the server's pending view lags behind; the stream already knows better.
  const pending = turn.isPending || (state.kind === 'pending' && stream.status !== 'stopped');
  const activeRunId = turn.runId ?? (state.kind === 'pending' ? (state.pending?.runId ?? null) : null);
  const settled = lastAssistantOrdinal(messages) > assistantWatermark;
  const streamed = stream.lookups.length > 0 || stream.reply.length > 0 || stream.changes.length > 0;
  const showStream = !settled && (turn.isPending || stream.status === 'stopped' || streamed);
  // A failed stream keeps what it wrote; the failure card joins it once the transcript has recorded the failure.
  const showTurnStatus = !showStream || (stream.status === 'failed' && state.kind !== 'pending');
  const locked = session ? session.status !== 'active' : starting;
  const busy = pending || locked;
  const notesOpener = notesOpenerId(messages);
  const answeredUpTo = lastUserOrdinal(messages);
  const projectChoice: TurnChoice = { contentMode: project?.contentMode ?? 'standard', costTier: project?.costTier ?? 'balanced' };
  const defaults = turnChoiceDefaults(session, projectChoice);
  // A model and cost pick is the chat's own setting. It is held here only until the chat exists and the save lands, and goes on each turn meanwhile.
  if (turnChoice && sameChoice(turnChoice, defaults.choice)) setTurnChoice(undefined);
  const saveChoice = (sessionId: string, choice: TurnChoice): void =>
    saveChatChoice.mutate(
      { sessionId, ...chatChoiceUpdate(choice, projectChoice) },
      {
        onError: err => {
          setTurnChoice(undefined);
          toast.danger(err.message);
        },
      },
    );
  const savedPickFor = useRef<string | undefined>(undefined);
  const chooseModel = (choice: TurnChoice): void => {
    setTurnChoice(choice);
    if (!session) return;
    savedPickFor.current = session.id;
    saveChoice(session.id, choice);
  };
  useEffect(() => {
    if (!session || !turnChoice || savedPickFor.current === session.id) return;
    savedPickFor.current = session.id;
    saveChoice(session.id, turnChoice);
  });

  const finishedId = stream.status === 'done' ? stream.turn.assistantMessage.id : undefined;
  const finishedHeld = stream.status === 'done' ? stream.turn.held : undefined;
  const finishedWorked = useMemo(() => (stream.status === 'done' ? turnTimeline(stream, stream.timing.endedAt ?? 0, mode).worked : null), [stream, mode]);

  const messageIds = useMemo(() => new Set(messages.map(message => message.id)), [messages]);
  const jobsByMessage = useMemo(() => {
    const grouped = new Map<string, ChatJobState[]>();
    for (const job of jobStream.jobs) {
      const key = job.messageId && messageIds.has(job.messageId) ? job.messageId : '';
      grouped.set(key, [...(grouped.get(key) ?? []), job]);
    }
    return grouped;
  }, [jobStream.jobs, messageIds]);
  const looseJobs = jobsByMessage.get('') ?? NO_JOBS;
  const writing = generation.activity && !jobStream.jobs.some(job => job.id === generation.activity?.jobId) ? generation.activity : undefined;
  const continuityForYou = continuityQuery.data?.items ?? [];
  const bibleReceipts = (finalizeReviewsQuery.data?.applied ?? []).filter(review => !hiddenBibleReceipts.has(review.id));
  const bibleDecisions = finalizeReviewsQuery.data?.waiting ?? [];
  const hideBibleReceipt = (reviewId: string): void => setHiddenBibleReceipts(hideReceipt(reviewId));

  const shownProposals = useMemo(() => {
    const shown = new Set<string>();
    for (const message of messages) {
      if (message.proposalId) shown.add(message.proposalId);
      if (message.appliedProposalId) shown.add(message.appliedProposalId);
    }
    for (const job of jobStream.jobs) {
      if (job.progress.proposalId) shown.add(job.progress.proposalId);
      if (job.progress.appliedProposalId) shown.add(job.progress.appliedProposalId);
    }
    return shown;
  }, [messages, jobStream.jobs]);
  const pendingWork = usePendingItems(novelId, session?.id, shownProposals);
  const draftsForYou = pendingWork.drafts;
  const sessionProposals = useMemo(
    () => (session ? (proposalsQuery.data?.items ?? NO_PROPOSALS).filter(proposal => proposal.sessionId === session.id) : NO_PROPOSALS),
    [proposalsQuery.data, session],
  );
  const waiting = (proposalsQuery.data?.items ?? []).filter(proposal => session && proposal.sessionId === session.id && !shownProposals.has(proposal.id));
  const waitingPlans = waiting.filter(proposal => proposal.kind === PLAN_KIND);
  const waitingCards = waiting.filter(proposal => proposal.kind !== PLAN_KIND);
  const threadCards = waiting.length + draftsForYou.length + continuityForYou.length + bibleReceipts.length + bibleDecisions.length + (writing ? 1 : 0);
  const view = chatColumnView({ messageCount: messages.length, loading: messagesQuery.isLoading, active: pending || showStream || planStartOpen || threadCards > 0 });
  const ordinals = new Map(messages.map(message => [message.id, message.ordinal]));
  const panelProposals: PanelProposals[] = [
    ...jobStream.jobs.flatMap(job => jobProposals(job, job.messageId ? ordinals.get(job.messageId) : undefined) ?? []),
    ...waitingCards.filter(answeredInPanel).map(proposal => ({ key: proposal.id, proposalId: proposal.id })),
  ];

  const opener = openerChip(project?.kind, messages.length, notes);
  const chips: PromptChip[] = composerChips([...(opener ? [opener] : []), ...promptChips(nextChapter)], {
    running: pending,
    awaitingAnswer: awaitingAnswer(messages),
  });

  const switching = updateSession.isPending && updateSession.variables?.mode !== undefined;
  const shownMode = (switching ? updateSession.variables?.mode : undefined) ?? mode;

  // Stay pinned to the newest message: inline cards load after the transcript, so follow content growth while the
  // author is near the bottom, and stop following the moment they scroll up to read.
  const pinnedRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => {
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setAwayFromLatest(!pinnedRef.current);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // The thread itself shrinks as the composer grows; keeping its bottom edge where it was is what keeps the newest lines in view.
    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      const shrunk = height - el.clientHeight;
      height = el.clientHeight;
      if (pinnedRef.current) el.scrollTo({ top: el.scrollHeight });
      else if (shrunk !== 0) el.scrollTop += shrunk;
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, []);

  // Sending is the one moment the thread jumps to the newest turn regardless; everything else follows only while pinned.
  useEffect(() => {
    if (!pending) return;
    pinnedRef.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [pending]);

  // The pill unmounts once the thread reaches the bottom, so focus it held moves on to the composer rather than the page.
  const jumpToLatest = (pill: HTMLElement): void => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    if (document.activeElement === pill) inputRef.current?.focus({ preventScroll: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  };

  // Send turns the Send button into Stop, which drops focus to the page; when the turn ends it goes back to the composer.
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && shouldRefocusComposer(document.activeElement, composerRef.current, document.body)) inputRef.current?.focus();
    wasPending.current = pending;
  }, [pending]);

  const { announcement, announce } = useLiveAnnouncer();
  useJobAnnouncements(jobStream.jobs, announce);

  // A job that ends with changes while the panel follows the latest settled turn takes the panel, so its card opens the dock as a turn's would.
  const [jobsSeen, setJobsSeen] = useState(jobStream.jobs);
  if (jobsSeen !== jobStream.jobs) {
    setJobsSeen(jobStream.jobs);
    const before = new Map(jobsSeen.map(job => [job.id, job.status]));
    const endedNow = (job: ChatJobState): boolean => {
      const was = before.get(job.id);
      return jobSettled(job.status) && (was === undefined ? job.seq > 0 : !jobSettled(was));
    };
    const ended = jobStream.jobs.find(job => endedNow(job) && jobProposals(job, undefined));
    if (ended && !pending && panelFocus === undefined) setPanelFocus(ended.id);
  }

  const currentSettings = (): TurnSettings => ({ proseEdits, justDiscussing, choice: turnChoice });

  // A refusal names one chapter at most, so the chips are checked against their drafts as they stand now to tell which changed.
  const markChanged = async (chips: readonly PassageChip[]): Promise<void> => {
    const chapters = [...new Set(chips.map(chip => chip.context.chapter))];
    const fresh = await Promise.all(
      chapters.map(async chapter => [chapter, await queryClient.fetchQuery({ ...draftQueryOptions(novelId, chapter), staleTime: 0 }).catch(() => undefined)] as const),
    );
    passages.markStale(staleChipIds(chips, new Map(fresh)));
  };

  // Chips a turn has taken but the server has not answered for yet: they stay in the composer until it does, but never ride a second message.
  const inFlight = useRef(new Set<string>());
  const settle = (ids: ReadonlySet<string>): void => ids.forEach(id => inFlight.current.delete(id));

  const sendTurn = (content: string, draft?: string, settings: TurnSettings = currentSettings(), requeue?: QueuedTurn, chips: readonly PassageChip[] = []): void => {
    if (!session || (!content && chips.length === 0) || pending) return;
    setAssistantWatermark(lastAssistantOrdinal(messages));
    const override = turnOverride(settings.choice, defaults.choice);
    const sent = new Set(chips.map(chip => chip.id));
    sent.forEach(id => inFlight.current.add(id));
    const passageOptions = chips.length > 0 ? { contexts: chipContexts(chips), shown: shownContexts(chips) } : {};
    turn.send(
      content,
      {
        onAccepted: () => {
          settle(sent);
          passages.drop(sent);
        },
        onSuccess: result => {
          announce(turnAnnouncement(turnOutcome(result)));
          invalidateProgress(queryClient, novelId);
          invalidateDraft(queryClient, novelId);
          const note = applyNoteToast(result);
          if (note) toast.warning(note);
        },
        onError: async (err, context) => {
          announce(turnAnnouncement({ applied: 0, suggested: 0, failed: true }));
          const refused = PASSAGE_REFUSALS.has(err.code);
          const recorded = await isTurnFailureRecorded(queryClient, novelId, session.id, context?.previous);
          const { stored, queue, input: restored, chips: back } = afterFailedSend(recorded, requeue, draft, Boolean(queueNow.current) || refused);
          settle(sent);
          if (stored) return passages.drop(sent);
          toast.danger(err.message);
          if (queue) setQueued(queue);
          if (back) passages.restore(back);
          if (restored) setInput(current => (current.trim() ? `${restored}\n${current}` : restored));
          if (err.code === 'CHT_009') void markChanged(chips);
        },
      },
      { proseEdits: settings.proseEdits, justDiscussing: settings.justDiscussing, ...override, ...passageOptions },
    );
  };

  const staleChips = passages.chips.some(chip => chip.stale);
  const sendable = !staleChips && (input.trim().length > 0 || (Boolean(session) && passages.chips.length > 0));

  const send = (): void => {
    const content = input.trim();
    const chips = passages.latest().filter(chip => !inFlight.current.has(chip.id));
    if ((!content && chips.length === 0) || chips.some(chip => chip.stale)) return;
    if (!session) {
      if (content && !starting) props.onStart(content, draftMode);
      return;
    }
    if (switching) return;
    if (pending) return enqueue(content, chips);
    setInput('');
    sendTurn(content, content, currentSettings(), undefined, chips);
  };

  const { queued, setQueued, queueNow, step, enqueue, releaseQueued, editQueuedMessage } = useTurnQueue({
    running: pending,
    locked,
    watching: turn.isPending,
    streamStatus: stream.status,
    finishedId,
    inTranscript: finishedId !== undefined && messageIds.has(finishedId),
    input,
    settings: currentSettings,
    send: sendTurn,
    onEnqueued: chips => {
      setInput('');
      passages.drop(new Set(chips.map(chip => chip.id)));
    },
    onEdited: edited => {
      passages.restore(edited.chips);
      setInput(edited.input);
      setProseEdits(edited.settings.proseEdits);
      setJustDiscussing(edited.settings.justDiscussing);
      inputRef.current?.focus();
    },
  });

  useOpeningTurn({
    sessionId: session?.id,
    initialTurn,
    onInitialTurnSent,
    messagesLoaded: messagesQuery.isSuccess,
    empty: messages.length === 0,
    sendInitial: content => {
      setInput(current => (current.trim() === content ? '' : current));
      sendTurn(content, content, currentSettings(), undefined, passages.latest());
    },
    sendFirst: content => sendTurn(content, content),
  });

  const stop = (): void => {
    if (!activeRunId) return;
    turn.stop(
      {
        onOutcome: outcome => {
          if (outcome === 'not_delivered') toast.warning("Couldn't confirm the stop — Forge may still be working. Try again in a moment.");
        },
        onError: err => toast.danger(err.message),
      },
      activeRunId,
    );
  };

  const renameSession = (title: string): void => {
    if (!session) return;
    updateSession.mutate(
      { sessionId: session.id, title },
      {
        onSuccess: () => setRenamingHeader(false),
        onError: err => {
          setRenamingHeader(false);
          toast.danger(err.message);
        },
      },
    );
  };

  const changeMode = (value: ComposerMode): void => {
    const change = composerModeChange(value, mode);
    const wasDiscussing = justDiscussing;
    setJustDiscussing(change.justDiscussing);
    if (!change.sessionMode) return;
    if (!session) return setDraftMode(change.sessionMode);
    updateSession.mutate(
      { sessionId: session.id, mode: change.sessionMode },
      {
        onError: err => {
          setJustDiscussing(wasDiscussing);
          toast.danger(err.message);
        },
      },
    );
  };

  const onChip = (chip: PromptChip): void => {
    if (chip === opener && session && !pending) return sendTurn(chip.prompt);
    if (chip.label === `Plan chapter ${nextChapter}`) return openPlanStart();
    setInput(chip.prompt);
    inputRef.current?.focus();
  };

  // A failed turn's retry sends its comments again with it; a message of comments alone would otherwise have nothing to send.
  const retryTurn = (content: string): void => {
    const last = messages.filter(message => message.role === 'user').at(-1);
    sendTurn(content, undefined, currentSettings(), undefined, chipsOfSent(last?.contexts));
  };

  const revealChip = (chip: PassageChip): void => {
    if (chip.context.chapter !== chapter) props.onOpenChapter(chip.context.chapter, 'read');
    setChipReveal(nextReveal(chip.id, revealCount.current++));
  };

  // "Rewrite with AI" needs Edit prose for the chat to answer with a rewrite card, and leaves the author in the composer to add what to change.
  const addComment = (added: PassageChip, then: CommentFollowUp): boolean => {
    const chip =
      then === 'rewrite'
        ? rewriteChip(
            added,
            passages.latest().find(existing => existing.id === added.id),
          )
        : added;
    if (!passages.add(chip)) return false;
    if (then === 'rewrite' && !proseEdits) {
      setProseEdits(true);
      toast.info('Edit prose is now on, so the chat can rewrite the passage.');
    }
    if (then === 'send' && session && !locked) send();
    else if (then !== 'stay') inputRef.current?.focus();
    return true;
  };

  const panelComments: PanelComments = {
    chips: passages.chips,
    limitReason: chipLimitReason(passages.chips.length),
    proposals: sessionProposals,
    reveal: chipReveal,
    onRevealed: () => setChipReveal(undefined),
    onAdd: addComment,
    onMissing: chipId => {
      passages.markStale(new Set([chipId]));
      toast.warning('That passage changed — select it again.');
    },
  };

  const markProgress = (key: ProgressItemKey, status: ProgressOverrideStatus): void => {
    progressOverride.mutate({ key, status }, { onError: err => toast.danger(err.message) });
  };

  const onApplied = (result: ApplyProposalResponse): void => {
    invalidateProgress(queryClient, novelId);
    jobStream.track(result.jobs.map(job => ({ id: job.jobId, kind: jobKindForOp(result.proposal.changeSet[job.index]) })));
  };

  const onWriting = (job: JobEnqueueResponse): void => {
    if (job.kind === 'plan' || job.kind === 'organise') jobStream.track([{ id: job.jobId, kind: job.kind }]);
  };

  // A revision rewrites the prose, so the request goes out with Edit prose on; the author finishes the sentence with what to change.
  const askForChanges = (chapter: number, note = ''): void => {
    const draft = `Revise chapter ${chapter}: ${note}`;
    setProseEdits(true);
    setInput(draft);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(draft.length, draft.length);
    });
  };

  const cancelJob = (jobId: string): void => {
    setCancellingJob(jobId);
    cancelJobMutation.mutate(jobId, {
      onSuccess: result => {
        if (result.outcome === 'already_settled') toast.warning('It had already finished.');
      },
      onError: err => toast.danger(err.message),
      onSettled: () => setCancellingJob(undefined),
    });
  };

  const leaveUndecided = (key: ProgressItemKey | undefined): void => {
    if (!key) return sendTurn('Undecided for now.');
    progressOverride.mutate(
      { key, status: 'undecided' },
      { onSuccess: () => toast.success('Left open — it counts as answered on the checklist.'), onError: err => toast.danger(err.message) },
    );
  };

  // A reveal left over from an earlier review would scroll and focus a panel that opened on its own, taking the author out of the composer.
  const closeDock = (dismissed: string | undefined): void => {
    setDock({ kind: 'closed', dismissed });
    setPanelReveal(0);
  };

  const openChangesSheet = (): void => {
    setSheetReveals(true);
    setSheetOpen(true);
  };

  // The panel docks only where the thread keeps its full column beside it and no chapter holds the right side; otherwise the receipt opens it as a sheet.
  const reviewInPanel = (key: string): void => {
    setPanelFocus(key);
    setPanelReveal(count => count + 1);
    if (chapter === undefined && (frameRef.current?.offsetWidth ?? 0) >= PANEL_DOCK_MIN) return setDock({ kind: 'open' });
    openChangesSheet();
  };

  // Closing the panel hands focus back to the card it was opened from, or to the composer, rather than leaving it on the page.
  useEffect(() => {
    if (chapter === undefined) return;
    const composer = inputRef.current;
    return () => {
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        (document.querySelector<HTMLElement>(`[data-open-chapter="${chapter}"]`) ?? composer)?.focus({ preventScroll: true });
      });
    };
  }, [chapter]);

  const { showPending, awaitPending } = useRevealPending(scrollRef);

  const adoptPending = (item: PendingItem & { proposalId: string }): void => {
    if (!session) return props.onStartForCard(item.proposalId);
    adoptProposal.mutate(
      { proposalId: item.proposalId, sessionId: session.id },
      {
        onSuccess: () => {
          awaitPending(item.key);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  // Handled once per card: shown where the thread holds it, otherwise brought into this chat first.
  const cardHandled = useRef<string | undefined>(undefined);
  useEffect(() => {
    const { revealCard, onCardRevealed } = props;
    if (!revealCard || !session || !pendingWork.ready || cardHandled.current === revealCard) return;
    cardHandled.current = revealCard;
    onCardRevealed?.();
    const item = pendingWork.items.find(entry => entry.key === pendingKey('proposal', revealCard));
    if (!item) return void toast.warning('That card is no longer waiting on you.');
    if (item.proposalId) return adoptPending({ ...item, proposalId: item.proposalId });
    showPending(item.key);
  });

  // A turn starting anywhere — this composer, a chip, a queued first message, another tab — takes the panel back to it.
  const [panelSawPending, setPanelSawPending] = useState(pending);
  if (pending !== panelSawPending) {
    setPanelSawPending(pending);
    if (pending) {
      setPanelFocus(undefined);
      closeDock(undefined);
    }
  }

  const planStartBar = useRef<HTMLDivElement>(null);
  const focusPlanStart = useRef(false);
  const openPlanStart = (): void => {
    focusPlanStart.current = true;
    setPlanStartOpen(true);
  };
  useEffect(() => {
    if (!planStartOpen || !focusPlanStart.current) return;
    focusPlanStart.current = false;
    planStartBar.current?.nextElementSibling?.querySelector<HTMLElement>('button, textarea')?.focus();
  }, [planStartOpen]);

  // Without a chat yet, the plan request becomes the opening message, which creates one.
  const askForPlan = (content: string): void => {
    setPlanStartOpen(false);
    if (session) return sendTurn(content);
    if (!starting) props.onStart(content, draftMode);
  };

  const writeMyself = (): void => {
    setPlanStartOpen(false);
    startNextDraft.mutate(undefined, {
      onSuccess: draft => void navigate({ to: '/novels/$novelId/chapters', params: { novelId }, search: { chapter: draft.chapter } }),
      onError: err => toast.danger(err.message),
    });
  };

  const latest = useRef<TranscriptActions | null>(null);
  useLayoutEffect(() => {
    latest.current = {
      sendTurn,
      onApplied,
      onWriting,
      cancelJob,
      answer: option => sendTurn(option.title),
      leaveUndecided,
      focusComposer: () => inputRef.current?.focus(),
      reviewInPanel,
    };
  });
  const actions = useMemo<TranscriptActions>(
    () => ({
      sendTurn: (content, draft) => latest.current?.sendTurn(content, draft),
      onApplied: result => latest.current?.onApplied(result),
      onWriting: job => latest.current?.onWriting(job),
      cancelJob: jobId => latest.current?.cancelJob(jobId),
      answer: option => latest.current?.answer(option),
      leaveUndecided: key => latest.current?.leaveUndecided(key),
      focusComposer: () => latest.current?.focusComposer(),
      reviewInPanel: key => latest.current?.reviewInPanel(key),
    }),
    [],
  );

  const passageCaption = staleChips
    ? 'A passage you commented on changed — select it again, or remove its comment.'
    : !session && passages.chips.length > 0 && !input.trim()
      ? 'Write a message to start the chat — your comments go with it.'
      : undefined;

  const notices = unanswered > 0 && <div className={styles.composerNotice}>{unansweredWarning(unanswered)}</div>;

  const conversation = view.kind === 'conversation';
  const panelTurn = panelTurnOf({ stream, streamShown: showStream, messages, focus: panelFocus, proposals: panelProposals });
  const panelRefs = turnRefs(panelTurn);
  const panelCards = useProposalQuery(novelId, panelRefs.proposalId).data ?? panelRefs.cards;
  const reviewCardsId = panelCards?.status === 'pending' ? panelCards.id : undefined;
  const nextDock = dockState(dock, reviewCardsId);
  if (nextDock !== dock) setDock(nextDock);

  return (
    <div ref={frameRef} className={styles.frame}>
      {/* The chapter sheet covers the chat at this width, so the chat under it is out of reach of Tab and screen readers too. */}
      <div className={styles.column} inert={narrow && chapter !== undefined}>
        <div className={styles.head}>
          <div className={styles.headInner}>
            {session && renamingHeader ? (
              <RenameInput
                label={`Rename “${chatTitle(session)}”`}
                value={session.title ?? ''}
                loading={updateSession.isPending}
                onCommit={renameSession}
                onCancel={() => setRenamingHeader(false)}
                className={styles.headTitleInput}
              />
            ) : session ? (
              <button type="button" className={styles.headTitleButton} aria-label={`Rename “${chatTitle(session)}”`} onClick={() => setRenamingHeader(true)}>
                <span className={styles.headTitle}>{session.title ?? (state.kind === 'pending' ? 'Naming…' : 'New chat')}</span>
                <EditIcon size={13} className={styles.headTitleEdit} />
              </button>
            ) : (
              <span className={styles.headTitle}>New chat</span>
            )}
            {session && session.status !== 'active' && (
              <StatusChip intent="neutral" dot>
                {session.status}
              </StatusChip>
            )}
            {session?.mode === 'manual' && <StatusChip intent="warning">manual</StatusChip>}
            <div className={styles.headActions}>
              <Button asChild variant="secondary" size="sm" className={styles.phoneOnly}>
                <Link to="/novels/$novelId/story-bible" params={{ novelId }}>
                  Story Bible
                </Link>
              </Button>
              <Button variant="ghost" size="sm" prefix={<ProposalsIcon size={14} />} onClick={props.onOpenChanges}>
                <span className={styles.headLabel}>Changes</span>
              </Button>
              <Button variant="ghost" size="sm" prefix={<ClockIcon size={14} />} onClick={props.onOpenHistory}>
                <span className={styles.headLabel}>History</span>
              </Button>
              <Button variant="primary" size="sm" prefix={<PlusIcon size={14} />} onClick={props.onNewChat}>
                <span className={styles.headLabel}>New chat</span>
              </Button>
            </div>
          </div>
        </div>

        {/* One flex column in two states: `data-view` moves the stack between centred and transcript-above-composer.
          Every branch keeps its slot, so the composer never unmounts and the draft, the focus and the model pick survive. */}
        <div className={styles.body} data-view={view.kind}>
          <div ref={scrollRef} className={`nf-scroll ${styles.scroll}`}>
            <div className={styles.msgList}>
              {view.kind === 'conversation' && (
                <ReadyChecklist
                  view={checklist}
                  loading={progressQuery.isLoading}
                  error={progressQuery.error}
                  onRetry={() => void progressQuery.refetch()}
                  expanded={checklistOpen}
                  onToggle={() => setChecklistOpen(open => !open)}
                  onMark={markProgress}
                  busyKey={progressOverride.isPending ? progressOverride.variables?.key : undefined}
                />
              )}
              {messagesQuery.isLoading && <PaneLoader />}
              {messagesQuery.error && <PaneError error={messagesQuery.error} />}
              {messages.map(m =>
                m.role === 'user' ? (
                  <div key={m.id} className={styles.userRow}>
                    <div className={styles.userCol}>
                      {m.contexts && m.contexts.length > 0 && <SentPassages contexts={m.contexts} />}
                      {m.content.trim() && <div className={styles.userBubble}>{m.content}</div>}
                      {m.id === notesOpener && notes?.trim() && <NotesChip notes={notes} />}
                      {session && offersNotes(m) && <SaveAsNotesOffer novelId={novelId} sessionId={session.id} messageId={m.id} />}
                      <time className={styles.userTime} dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString()}>
                        {messageTime(m.createdAt)}
                      </time>
                    </div>
                  </div>
                ) : (
                  <AssistantMessage
                    key={m.id}
                    novelId={novelId}
                    message={m}
                    settledQuestions={answeredUpTo > m.ordinal}
                    eyebrow={questionEyebrow(m.question?.progressKey, checklist)}
                    held={m.id === finishedId ? finishedHeld : undefined}
                    busy={busy}
                    jobs={jobsByMessage.get(m.id) ?? NO_JOBS}
                    streamStatus={jobStream.status}
                    cancellingJob={cancellingJob}
                    nextChapter={nextChapter}
                    actions={actions}
                  />
                ),
              )}
              {showStream && (
                <LiveStreamedTurn
                  stream={stream}
                  mode={mode}
                  receipt={
                    stream.status === 'done' && (
                      <TurnReceipt
                        novelId={novelId}
                        appliedProposalId={stream.turn.appliedProposal?.id}
                        proposalId={stream.turn.proposal?.id}
                        applied={stream.turn.appliedProposal}
                        cards={stream.turn.proposal}
                        held={stream.turn.held}
                        onReview={() => reviewInPanel(stream.turn.assistantMessage.id)}
                        onApplied={onApplied}
                      />
                    )
                  }
                  footer={stream.status === 'done' ? <MessageModelTag message={stream.turn.assistantMessage} worked={finishedWorked} /> : undefined}
                />
              )}
              {showTurnStatus && <TurnStatus state={state} sending={turn.isPending} fallbackLabel="Forge is reading your ask" onRetry={retryTurn} />}
              {looseJobs.length > 0 && (
                <div className={styles.indented}>
                  {looseJobs.map(job => (
                    <TranscriptJob key={job.id} novelId={novelId} job={job} stream={jobStream.status} cancelling={cancellingJob === job.id} actions={actions} />
                  ))}
                </div>
              )}
              {looseJobs.filter(isPlanJob).map(job => (
                <TranscriptPlanCard key={job.id} novelId={novelId} proposalId={job.progress.proposalId ?? ''} nextChapter={nextChapter} actions={actions} />
              ))}
              {waitingCards.length > 0 && (
                <section className={styles.indented} aria-label="Waiting on you">
                  {waitingCards.map(proposal => (
                    <PendingAnchor key={proposal.id} id={pendingKey('proposal', proposal.id)}>
                      {answeredInPanel(proposal) ? (
                        <TurnReceipt novelId={novelId} proposalId={proposal.id} cards={proposal} onReview={() => reviewInPanel(proposal.id)} onApplied={onApplied} />
                      ) : (
                        <TurnProposalCard novelId={novelId} proposal={proposal} onApplied={onApplied} />
                      )}
                    </PendingAnchor>
                  ))}
                </section>
              )}
              {waitingPlans.map(proposal => (
                <TranscriptPlanCard key={proposal.id} novelId={novelId} proposalId={proposal.id} nextChapter={nextChapter} actions={actions} />
              ))}
              {writing && (
                <div className={styles.indented}>
                  <JobProgress view={writingView(writing)} stream="live" cancelling={generation.stopping} onCancel={generation.stop} />
                </div>
              )}
              {draftsForYou.map(draft => (
                <PendingAnchor key={draft.chapter} id={pendingKey('draft', draft.chapter)}>
                  <ChapterDraftCard
                    novelId={novelId}
                    draft={draft}
                    beside={draftCardShape(draft.chapter, chapter) === 'pointer'}
                    onOpen={props.onOpenChapter}
                    onAskForChanges={askForChanges}
                  />
                </PendingAnchor>
              ))}
              {continuityForYou.map(proposal => (
                <PendingAnchor key={proposal.id} id={pendingKey('continuity', proposal.id)}>
                  <ContinuityProposalCard novelId={novelId} proposal={proposal} />
                </PendingAnchor>
              ))}
              {bibleReceipts.map(review => (
                <StoryBibleReceiptCard
                  key={review.id}
                  novelId={novelId}
                  review={review}
                  undoable={review.chapter === finalizeReviewsQuery.data?.undoableChapter}
                  onHide={() => hideBibleReceipt(review.id)}
                />
              ))}
              {bibleDecisions.map(review => (
                <PendingAnchor key={review.id} id={pendingKey('decisions', review.id)}>
                  <FinalizeDecisionsCard
                    novelId={novelId}
                    review={review}
                    settling={finalizeReviewsQuery.data?.settling.includes(review.id) ?? false}
                    onFixChapter={askForChanges}
                  />
                </PendingAnchor>
              ))}
              {planStartOpen && (
                <div ref={planStartBar} className={`${styles.indented} ${styles.planStartBar}`}>
                  <Button size="sm" variant="ghost" prefix={<CloseIcon size={14} />} onClick={() => setPlanStartOpen(false)}>
                    Not now
                  </Button>
                </div>
              )}
              {planStartOpen && (
                <PlanStart
                  chapter={nextChapter}
                  busy={busy || startNextDraft.isPending}
                  onPlanFromIntent={intent => askForPlan(`Plan chapter ${nextChapter}: ${intent}`)}
                  onEmptyPlan={() => askForPlan(`Start an empty plan for chapter ${nextChapter} with the plan action — I’ll fill it in myself.`)}
                  onWriteMyself={writeMyself}
                />
              )}
            </div>
            {awayFromLatest && view.kind === 'conversation' && (
              <div className={styles.jumpDock}>
                <Button size="sm" variant="secondary" className={styles.jump} prefix={<ChevronDownIcon size={14} />} onClick={event => jumpToLatest(event.currentTarget)}>
                  Latest
                </Button>
              </div>
            )}
          </div>

          {view.kind === 'centred' && (
            <div className={styles.hero}>
              <h2 className={styles.heroTitle}>What are we working on?</h2>
              <p className={styles.heroSub}>{heroText(name, mode)}</p>
            </div>
          )}

          <ChatComposer
            input={input}
            onInputChange={setInput}
            inputRef={inputRef}
            composerRef={composerRef}
            onSend={send}
            onStop={pending && activeRunId ? stop : undefined}
            stopping={turn.stopping}
            sending={!session && starting}
            running={pending}
            locked={locked}
            switching={switching}
            chips={chips}
            onChip={onChip}
            passages={passages.chips.length > 0 && <ComposerPassages chips={passages.chips} onReveal={revealChip} onRemove={passages.remove} />}
            sendable={sendable}
            modeMenu={<ComposerModeMenu value={composerModeOf(shownMode, justDiscussing)} onChange={changeMode} disabled={locked || pending || switching} />}
            modelMenu={<ChatModelMenu novelId={novelId} session={session} disabled={locked} turn={{ choice: turnChoice, onChange: chooseModel }} />}
            justDiscussing={justDiscussing}
            proseEdits={proseEdits}
            onProseEditsChange={setProseEdits}
            queued={queuedView(queued, step, stream.status)}
            onEditQueued={editQueuedMessage}
            onSendQueued={() => releaseQueued('now')}
            caption={inputCaption({ input, running: pending, queued: Boolean(queued), switching }) ?? passageCaption}
            notices={notices}
            tray={
              <WaitingTray
                items={pendingWork.items}
                tray={pendingWork.tray}
                canAdopt={!locked}
                adopting={adoptProposal.isPending ? adoptProposal.variables?.proposalId : undefined}
                onShow={showPending}
                onAdopt={adoptPending}
              />
            }
            announcement={announcement}
          />
        </div>
      </div>
      {chapter !== undefined && (
        <ChapterPanel
          key={chapter}
          novelId={novelId}
          chapter={chapter}
          comments={panelComments}
          request={props.chapterRequest}
          onClose={props.onCloseChapter}
          strip={
            conversation && dock.kind === 'open' && <ProgressDockStrip waiting={reviewCardsId !== undefined} onReview={openChangesSheet} onClose={() => closeDock(reviewCardsId)} />
          }
        />
      )}
      {conversation && (
        <ProgressDock
          novelId={novelId}
          turn={panelTurn}
          mode={mode}
          onApplied={onApplied}
          reveal={panelReveal}
          onBackToCurrent={panelFocus && pending ? () => setPanelFocus(undefined) : undefined}
          docked={dock.kind === 'open' && chapter === undefined}
          onClose={() => closeDock(reviewCardsId)}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
          sheetReveals={sheetReveals}
          notes={notes}
          busy={busy}
          onAddParagraph={paragraph => sendTurn(unusedParagraphPrompt(paragraph))}
        />
      )}
    </div>
  );
}

interface TranscriptPlanCardProps {
  novelId: string;
  proposalId: string;
  nextChapter: number;
  actions: TranscriptActions;
}

function TranscriptPlanCard({ novelId, proposalId, nextChapter, actions }: TranscriptPlanCardProps): React.JSX.Element {
  return (
    <PendingAnchor id={pendingKey('proposal', proposalId)}>
      <ChatPlanCard
        projectId={novelId}
        proposalId={proposalId}
        onAskForChanges={() => actions.sendTurn(`Let’s change the plan for chapter ${nextChapter}.`)}
        onPlanAgain={() => actions.sendTurn(`Plan chapter ${nextChapter} again from scratch.`)}
        onWriting={actions.onWriting}
      />
    </PendingAnchor>
  );
}

interface TranscriptJobProps {
  novelId: string;
  job: ChatJobState;
  stream: ChatJobStreamStatus;
  cancelling: boolean;
  actions: TranscriptActions;
}

function TranscriptJob({ novelId, job, stream, cancelling, actions }: TranscriptJobProps): React.JSX.Element {
  const view = jobView(job);
  return (
    <JobProgress view={view} stream={stream} cancelling={cancelling} onCancel={() => actions.cancelJob(job.id)}>
      {view.tone === 'done' && <JobOutcome novelId={novelId} job={job} actions={actions} />}
    </JobProgress>
  );
}

interface JobOutcomeProps {
  novelId: string;
  job: ChatJobState;
  actions: TranscriptActions;
}

/** What a finished job left: one receipt whose changes are reviewed in the panel. A plan is mounted beside the reply. */
function JobOutcome({ novelId, job, actions }: JobOutcomeProps): React.JSX.Element | null {
  const { progress } = job;
  if (!jobProposals(job, undefined)) return null;
  return (
    <PendingAnchor id={progress.proposalId ? pendingKey('proposal', progress.proposalId) : undefined}>
      <TurnReceipt
        novelId={novelId}
        appliedProposalId={progress.appliedProposalId}
        proposalId={progress.proposalId}
        ideas={organiseIdeas(progress.organised)}
        note={progress.applyNote}
        onReview={() => actions.reviewInPanel(job.id)}
        onApplied={actions.onApplied}
      />
    </PendingAnchor>
  );
}

interface OwnCardProps {
  novelId: string;
  query: UseQueryResult<ProposalResponse, ApiError>;
  onApplied: (result: ApplyProposalResponse) => void;
}

/** An action, prose or a plan edit keeps its own card in the thread; every other change is reviewed in the panel from the receipt. */
function OwnCard({ novelId, query, onApplied }: OwnCardProps): React.JSX.Element | null {
  if (query.error) {
    return (
      <Alert intent="danger" title="Couldn’t load these changes" action={{ label: 'Try again', onClick: () => void query.refetch() }}>
        {query.error.message}
      </Alert>
    );
  }
  return query.data ? <TurnProposalCard novelId={novelId} proposal={query.data} onApplied={onApplied} /> : null;
}

interface AssistantMessageProps {
  novelId: string;
  message: ChatMessageResponse;
  settledQuestions: boolean;
  eyebrow: string;
  /** Why the turn's cards were held, for the turn this tab ran. */
  held?: TurnHoldReason;
  busy: boolean;
  jobs: readonly ChatJobState[];
  streamStatus: ChatJobStreamStatus;
  cancellingJob?: string;
  nextChapter: number;
  actions: TranscriptActions;
}

/** A reply, then any plan card it staged as a sibling in the transcript — a plan card never sits inside the reply's flex column. */
const AssistantMessage = memo(function AssistantMessage({
  novelId,
  message,
  settledQuestions,
  eyebrow,
  held,
  busy,
  jobs,
  streamStatus,
  cancellingJob,
  nextChapter,
  actions,
}: AssistantMessageProps): React.JSX.Element {
  const question = useMemo(() => questionOf(message.question), [message.question]);
  const timeline = useMemo(() => (message.trace ? timelineOfTrace(message.trace) : undefined), [message.trace]);
  const content = message.content;
  const staged = useProposalQuery(novelId, message.proposalId ?? undefined);
  const isPlan = staged.data?.kind === PLAN_KIND;
  const ownCard = Boolean(message.proposalId) && turnCardsInline(staged.data, staged.isLoading);
  return (
    <>
      <div className={styles.assistantCol}>
        {timeline && <TurnTrace rows={timeline.trace} />}
        {content && (
          <div>
            <Markdown content={content} className={styles.assistantReply} />
            <MessageModelTag message={message} worked={timeline?.worked} />
          </div>
        )}
        {!content && timeline?.worked && <MessageModelTag message={message} worked={timeline.worked} />}
        {(message.appliedProposalId || (message.proposalId && !isPlan)) && (
          <PendingAnchor id={message.proposalId && !isPlan ? pendingKey('proposal', message.proposalId) : undefined}>
            <TurnReceipt
              novelId={novelId}
              appliedProposalId={message.appliedProposalId ?? undefined}
              proposalId={isPlan ? undefined : (message.proposalId ?? undefined)}
              held={held}
              onReview={() => actions.reviewInPanel(message.id)}
              onApplied={actions.onApplied}
            />
          </PendingAnchor>
        )}
        {ownCard && <OwnCard novelId={novelId} query={staged} onApplied={actions.onApplied} />}
        {question && (
          <QuestionCard
            key={`${message.id}:question`}
            question={question}
            eyebrow={eyebrow}
            settled={settledQuestions}
            disabled={busy}
            onPick={actions.answer}
            onUndecided={() => actions.leaveUndecided(question.progressKey)}
            onOwnWords={actions.focusComposer}
          />
        )}
        {jobs.map(job => (
          <TranscriptJob key={job.id} novelId={novelId} job={job} stream={streamStatus} cancelling={cancellingJob === job.id} actions={actions} />
        ))}
      </div>
      {isPlan && message.proposalId && <TranscriptPlanCard novelId={novelId} proposalId={message.proposalId} nextChapter={nextChapter} actions={actions} />}
      {jobs.filter(isPlanJob).map(job => (
        <TranscriptPlanCard key={job.id} novelId={novelId} proposalId={job.progress.proposalId ?? ''} nextChapter={nextChapter} actions={actions} />
      ))}
    </>
  );
});
