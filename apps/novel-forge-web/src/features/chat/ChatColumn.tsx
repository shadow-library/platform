import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, toast } from '@shadow-library/ui';

import { ChevronDownIcon, ClockIcon, CloseIcon, EditIcon, PlusIcon, ProposalsIcon } from '@/components/icons';
import { PaneError, PaneLoader, StatusChip, TurnStatus } from '@/components/nf';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import { Markdown } from '@/components/nf/Markdown';
import { ChatPlanCard, PlanStart } from '@/features/plan-card';
import {
  type ApplyProposalResponse,
  type ChatJobProgress,
  type ChatJobState,
  type ChatJobStreamStatus,
  type ChatMessageResponse,
  type ChatSessionResponse,
  type ChatTurnResponse,
  invalidateProgress,
  isTurnFailureRecorded,
  type JobEnqueueResponse,
  jobSettled,
  type ProgressItemKey,
  type ProgressOverrideStatus,
  transcriptTurnState,
  type TurnHoldReason,
  useAuthorNotesQuery,
  useCancelChatJobMutation,
  useChatJobStream,
  useChatMessagesQuery,
  useChatTurnStream,
  useListProposalsQuery,
  useProgressOverrideMutation,
  useProgressQuery,
  useProjectQuery,
  useProjectStatusQuery,
  useProposalQuery,
  useStartNextDraftMutation,
  useUpdateChatSessionMutation,
} from '@/lib/apis';
import { type TurnChoice, turnChoiceDefaults, turnOverride } from '@/lib/chat-model';
import { chatColumnView, chatTitle } from '@/lib/chat-sessions';
import { timelineOfTrace, turnTimeline } from '@/lib/chat-turn-timeline';
import { messageTime, projectTitle } from '@/lib/format';
import { PANEL_DOCK_MIN } from '@/lib/sidebar-rail';
import { takePendingFirstTurn } from '@/lib/pending-first-turn';

import { editQueued, inputCaption, type QueuedTurn, queuedView, queueStep, releaseSettings, restoreFailed, type TurnSettings } from './chat-queue';
import { ChatComposer } from './ChatComposer';
import { NotesChip, SaveAsNotesOffer } from './ChatExtras';
import {
  applyNoteToast,
  awaitingAnswer,
  checklistView,
  composerChips,
  type ComposerMode,
  composerModeChange,
  composerModeOf,
  entryNotes,
  firstUserMessageId,
  heroText,
  jobKindForOp,
  jobView,
  lastUserOrdinal,
  offersNotes,
  openerChip,
  organiseReceiptView,
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
  type UnusedParagraph,
  unusedParagraphPrompt,
} from './chat-view';
import styles from './Chat.module.css';
import { ComposerModeMenu } from './ComposerModeMenu';
import { JobProgress } from './JobProgress';
import { OrganiseReceipt } from './OrganiseReceipt';
import { ProgressDock } from './ProgressPanel';
import { type DockState, dockState, panelTurnOf, turnRefs } from './progress-panel-view';
import { ProposalSlot } from './ProposalSlot';
import { QuestionCard } from './QuestionCard';
import { ReadyChecklist } from './ReadyChecklist';
import { RenameInput } from './RenameInput';
import { LiveStreamedTurn } from './StreamedTurn';
import { useUnansweredCount } from './suggestion-store';
import { TurnReceipt } from './TurnReceipt';
import { TurnTrace } from './TurnTimeline';

// Matches the shell's own pending-proposal query, so the transcript reads that cache rather than issuing a second request for the same rows.
const PENDING_PROPOSAL_LIMIT = 50;
const PLAN_KIND = 'chapter_plan';
const NO_JOBS: readonly ChatJobState[] = [];

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
  addParagraph: (paragraph: UnusedParagraph) => void;
  reviewInPanel: (messageId: string) => void;
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
  const { novelId, session, starting, initialTurn, onInitialTurnSent } = props;
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
  const startNextDraft = useStartNextDraftMutation(novelId);
  const unanswered = useUnansweredCount();

  const [input, setInput] = useState('');
  const [proseEdits, setProseEdits] = useState(false);
  const [justDiscussing, setJustDiscussing] = useState(false);
  const [draftMode, setDraftMode] = useState<SessionMode>('auto');
  const [queued, setQueued] = useState<QueuedTurn>();
  const [turnChoice, setTurnChoice] = useState<TurnChoice>();
  const [renamingHeader, setRenamingHeader] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [planStartOpen, setPlanStartOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [cancellingJob, setCancellingJob] = useState<string>();
  // Where the transcript's assistant messages stood when this tab's turn began; the turn's own reply is the first one past it.
  const [assistantWatermark, setAssistantWatermark] = useState(0);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  // The reply whose receipt asked for review; unset, the panel follows the latest turn.
  const [panelFocus, setPanelFocus] = useState<string>();
  const [panelReveal, setPanelReveal] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetReveals, setSheetReveals] = useState(false);
  const [dock, setDock] = useState<DockState>({ kind: 'closed' });
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
  const checklist = progressQuery.data ? checklistView(progressQuery.data.items, nextChapter - 1) : undefined;
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
  const view = chatColumnView({ messageCount: messages.length, loading: messagesQuery.isLoading, active: pending || showStream || planStartOpen });
  const locked = session ? session.status !== 'active' : starting;
  const busy = pending || locked;
  const firstUserId = firstUserMessageId(messages);
  const answeredUpTo = lastUserOrdinal(messages);
  const defaults = turnChoiceDefaults(session, { contentMode: project?.contentMode ?? 'standard', costTier: project?.costTier ?? 'balanced' });

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

  const shownProposals = new Set<string>();
  for (const message of messages) {
    if (message.proposalId) shownProposals.add(message.proposalId);
    if (message.appliedProposalId) shownProposals.add(message.appliedProposalId);
  }
  for (const job of jobStream.jobs) {
    if (job.progress.proposalId) shownProposals.add(job.progress.proposalId);
    if (job.progress.appliedProposalId) shownProposals.add(job.progress.appliedProposalId);
  }
  const waiting = (proposalsQuery.data?.items ?? []).filter(proposal => session && proposal.sessionId === session.id && !shownProposals.has(proposal.id));
  const waitingPlans = waiting.filter(proposal => proposal.kind === PLAN_KIND);
  const waitingCards = waiting.filter(proposal => proposal.kind !== PLAN_KIND);

  const opener = openerChip(project?.kind, messages.length, notes);
  const chips: PromptChip[] = composerChips([...(opener ? [opener] : []), ...promptChips(checklist?.items ?? [], nextChapter)], {
    running: pending,
    awaitingAnswer: awaitingAnswer(messages),
  });

  const step = queueStep({ queued, running: pending, locked, stream: stream.status, finishedId, inTranscript: finishedId !== undefined && messageIds.has(finishedId) });
  const queueNow = useRef(queued);
  useLayoutEffect(() => {
    queueNow.current = queued;
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

  // The region is emptied before each message so the same words — two turns ending alike — are read out again.
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = (text: string): void => {
    clearTimeout(announceTimer.current);
    setAnnouncement('');
    announceTimer.current = setTimeout(() => setAnnouncement(text), 100);
  };
  useEffect(() => () => clearTimeout(announceTimer.current), []);

  // A job is announced once, when it ends while this chat is open: seen running earlier, or first seen through a live event (seq above 0)
  // because it started and ended between two listings. A job the listing already reports as settled is history, not news.
  const jobStatuses = useRef(new Map<string, string>());
  useEffect(() => {
    for (const job of jobStream.jobs) {
      const before = jobStatuses.current.get(job.id);
      const endedNow = before === undefined ? job.seq > 0 : !jobSettled(before);
      if (endedNow && jobSettled(job.status)) announce(`${jobView(job).title}.`);
      jobStatuses.current.set(job.id, job.status);
    }
  }, [jobStream.jobs]);

  const currentSettings = (): TurnSettings => ({ proseEdits, justDiscussing, choice: turnChoice });

  const sendTurn = (content: string, draft?: string, settings: TurnSettings = currentSettings(), requeue?: QueuedTurn): void => {
    if (!session || !content || pending) return;
    setAssistantWatermark(lastAssistantOrdinal(messages));
    const override = turnOverride(settings.choice, defaults.choice);
    turn.send(
      content,
      {
        onSuccess: result => {
          announce(turnAnnouncement(turnOutcome(result)));
          // The model and cost pick is for this turn only; a failed send keeps it for the retry, and a newer pick for the next message stays.
          setTurnChoice(current => (current === settings.choice ? undefined : current));
          invalidateProgress(queryClient, novelId);
          const note = applyNoteToast(result);
          if (note) toast.warning(note);
        },
        onError: async (err, context) => {
          announce(turnAnnouncement({ applied: 0, suggested: 0, failed: true }));
          if (await isTurnFailureRecorded(queryClient, novelId, session.id, context?.previous)) return;
          toast.danger(err.message);
          const { queue, input: restored } = restoreFailed(requeue, draft, Boolean(queueNow.current));
          if (queue) setQueued(queue);
          if (restored !== undefined) setInput(current => (current.trim() ? `${restored}\n${current}` : restored));
        },
      },
      { proseEdits: settings.proseEdits, justDiscussing: settings.justDiscussing, ...override },
    );
  };

  const enqueue = (content: string): void => {
    if (queued || locked) return;
    setQueued({ content, ...currentSettings(), watching: turn.isPending, after: finishedId });
    setTurnChoice(undefined);
    setInput('');
  };

  const send = (): void => {
    const content = input.trim();
    if (!content) return;
    if (!session) {
      if (!starting) props.onStart(content, draftMode);
      return;
    }
    if (switching) return;
    if (pending) return enqueue(content);
    setInput('');
    sendTurn(content, content);
  };

  const releaseQueued = (via: 'auto' | 'now'): void => {
    if (!queued || pending || locked) return;
    setQueued(undefined);
    sendTurn(queued.content, undefined, releaseSettings(queued, currentSettings(), via), queued);
  };

  const editQueuedMessage = (): void => {
    if (!queued) return;
    const edited = editQueued(queued, input);
    setInput(edited.input);
    setProseEdits(edited.settings.proseEdits);
    setJustDiscussing(edited.settings.justDiscussing);
    setTurnChoice(edited.settings.choice);
    setQueued(undefined);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (step !== 'send') return;
    const timer = setTimeout(() => releaseQueued('auto'));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- releases the queue once, on the step turning to 'send'; the timer runs the render's own releaseQueued
  }, [step]);

  // Both opening messages are sent from a timer the effect's cleanup cancels, not from the effect itself: under StrictMode's
  // mount–unmount–mount the first pass only schedules, its cleanup cancels the timer (never a request in flight), and the ref keeps
  // the text for the second pass to send.
  const initialRef = useRef<string | undefined>(undefined);
  const initialConsumed = useRef(false);
  useEffect(() => {
    if (!initialTurn || initialConsumed.current) return;
    initialRef.current = initialTurn;
    const timer = setTimeout(() => {
      const content = initialRef.current;
      if (!content || initialConsumed.current) return;
      initialConsumed.current = true;
      onInitialTurnSent?.();
      setInput(current => (current.trim() === content ? '' : current));
      sendTurn(content, content);
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sends once per handed-off message; initialConsumed guards every later run
  }, [initialTurn]);

  // The Start screen's opening message: taken only once the transcript is known to be empty, and sent only while it still is.
  const queuedRef = useRef<string | undefined>(undefined);
  const messagesLoaded = messagesQuery.isSuccess;
  const empty = messages.length === 0;
  useEffect(() => {
    if (!session || !messagesLoaded || !empty) return;
    queuedRef.current ??= takePendingFirstTurn(session.id);
    if (!queuedRef.current) return;
    const timer = setTimeout(() => {
      const queued = queuedRef.current;
      if (!queued) return;
      queuedRef.current = undefined;
      sendTurn(queued, queued);
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sends at most once: the ref empties as it sends, and a transcript with messages stops the next pass
  }, [session?.id, messagesLoaded, empty]);

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

  const markProgress = (key: ProgressItemKey, status: ProgressOverrideStatus): void => {
    progressOverride.mutate({ key, status }, { onError: err => toast.danger(err.message) });
  };

  const onApplied = (result: ApplyProposalResponse): void => {
    invalidateProgress(queryClient, novelId);
    jobStream.track(result.jobs.map(job => ({ id: job.jobId, kind: jobKindForOp(result.proposal.changeSet[job.index]) })));
  };

  const onWriting = (job: JobEnqueueResponse): void => {
    if (job.kind === 'plan' || job.kind === 'organise') return jobStream.track([{ id: job.jobId, kind: job.kind }]);
    toast.success('Writing started — follow it in the generation activity at the top of the page.');
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

  // The panel docks only where the thread keeps its full column beside it; narrower, the receipt opens it as a sheet.
  const reviewInPanel = (messageId: string): void => {
    setPanelFocus(messageId);
    setPanelReveal(count => count + 1);
    if ((frameRef.current?.offsetWidth ?? 0) >= PANEL_DOCK_MIN) return setDock({ kind: 'open' });
    setSheetReveals(true);
    setSheetOpen(true);
  };

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
      addParagraph: paragraph => sendTurn(unusedParagraphPrompt(paragraph)),
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
      addParagraph: paragraph => latest.current?.addParagraph(paragraph),
      reviewInPanel: messageId => latest.current?.reviewInPanel(messageId),
    }),
    [],
  );

  const notices = unanswered > 0 && <div className={styles.composerNotice}>{unansweredWarning(unanswered)}</div>;

  const conversation = view.kind === 'conversation';
  const panelTurn = panelTurnOf({ stream, streamShown: showStream, messages, focus: panelFocus });
  const panelRefs = turnRefs(panelTurn);
  const panelCards = useProposalQuery(novelId, panelRefs.proposalId).data ?? panelRefs.cards;
  const reviewCardsId = panelCards?.status === 'pending' ? panelCards.id : undefined;
  const nextDock = dockState(dock, reviewCardsId);
  if (nextDock !== dock) setDock(nextDock);

  return (
    <div ref={frameRef} className={styles.frame}>
      <div className={styles.column}>
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
                      <div className={styles.userBubble}>{m.content}</div>
                      {m.id === firstUserId && notes?.trim() && <NotesChip notes={notes} />}
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
                    eyebrow={questionEyebrow(m.question?.progressKey, checklist, answeredUpTo > m.ordinal)}
                    held={m.id === finishedId ? finishedHeld : undefined}
                    busy={busy}
                    jobs={jobsByMessage.get(m.id) ?? NO_JOBS}
                    streamStatus={jobStream.status}
                    cancellingJob={cancellingJob}
                    notes={notes}
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
              {showTurnStatus && <TurnStatus state={state} sending={turn.isPending} fallbackLabel="Forge is reading your ask" onRetry={content => sendTurn(content)} />}
              {looseJobs.length > 0 && (
                <div className={styles.indented}>
                  {looseJobs.map(job => (
                    <TranscriptJob
                      key={job.id}
                      novelId={novelId}
                      job={job}
                      stream={jobStream.status}
                      cancelling={cancellingJob === job.id}
                      notes={notes}
                      busy={busy}
                      actions={actions}
                    />
                  ))}
                </div>
              )}
              {looseJobs.filter(isPlanJob).map(job => (
                <TranscriptPlanCard key={job.id} novelId={novelId} proposalId={job.progress.proposalId ?? ''} nextChapter={nextChapter} actions={actions} />
              ))}
              {waitingCards.length > 0 && (
                <section className={`${styles.waiting} ${styles.indented}`} aria-label="Waiting on you">
                  {waitingCards.map(proposal => (
                    <ProposalSlot key={proposal.id} novelId={novelId} proposalId={proposal.id} onApplied={onApplied} />
                  ))}
                </section>
              )}
              {waitingPlans.map(proposal => (
                <TranscriptPlanCard key={proposal.id} novelId={novelId} proposalId={proposal.id} nextChapter={nextChapter} actions={actions} />
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
            modeMenu={<ComposerModeMenu value={composerModeOf(shownMode, justDiscussing)} onChange={changeMode} disabled={locked || pending || switching} />}
            modelMenu={<ChatModelMenu novelId={novelId} session={session} disabled={locked} turn={{ choice: turnChoice, onChange: setTurnChoice }} />}
            justDiscussing={justDiscussing}
            proseEdits={proseEdits}
            onProseEditsChange={setProseEdits}
            queued={queuedView(queued, step, stream.status)}
            onEditQueued={editQueuedMessage}
            onSendQueued={() => releaseQueued('now')}
            caption={inputCaption({ input, running: pending, queued: Boolean(queued), switching })}
            notices={notices}
            announcement={announcement}
          />
        </div>
      </div>
      {conversation && (
        <ProgressDock
          novelId={novelId}
          turn={panelTurn}
          mode={mode}
          onApplied={onApplied}
          reveal={panelReveal}
          onBackToCurrent={panelFocus && pending ? () => setPanelFocus(undefined) : undefined}
          docked={dock.kind === 'open'}
          onClose={() => closeDock(reviewCardsId)}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
          sheetReveals={sheetReveals}
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
    <ChatPlanCard
      projectId={novelId}
      proposalId={proposalId}
      onAskForChanges={() => actions.sendTurn(`Let’s change the plan for chapter ${nextChapter}.`)}
      onPlanAgain={() => actions.sendTurn(`Plan chapter ${nextChapter} again from scratch.`)}
      onWriting={actions.onWriting}
    />
  );
}

interface TranscriptJobProps {
  novelId: string;
  job: ChatJobState;
  stream: ChatJobStreamStatus;
  cancelling: boolean;
  notes?: string;
  busy: boolean;
  actions: TranscriptActions;
}

function TranscriptJob({ novelId, job, stream, cancelling, notes, busy, actions }: TranscriptJobProps): React.JSX.Element {
  const view = jobView(job);
  return (
    <JobProgress view={view} stream={stream} cancelling={cancelling} onCancel={() => actions.cancelJob(job.id)}>
      {view.tone === 'done' && job.kind !== 'plan' && <JobOutcome novelId={novelId} progress={job.progress} notes={notes} busy={busy} actions={actions} />}
    </JobProgress>
  );
}

interface JobOutcomeProps {
  novelId: string;
  progress: ChatJobProgress;
  notes?: string;
  busy: boolean;
  actions: TranscriptActions;
}

/** What a finished job left behind: an organise receipt with its applied block, unused paragraphs and card. A plan is mounted beside the reply instead. */
function JobOutcome({ novelId, progress, notes, busy, actions }: JobOutcomeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [left, setLeft] = useState<ReadonlySet<number>>(new Set());
  const receipt = progress.organised;
  const applied = progress.appliedProposalId && (
    <ProposalSlot novelId={novelId} proposalId={progress.appliedProposalId} paragraphs={receipt && new Map(receipt.applied.map(entry => [entry.opIndex, entry.paragraphs]))} />
  );
  const card = progress.proposalId && (
    <ProposalSlot
      novelId={novelId}
      proposalId={progress.proposalId}
      onApplied={actions.onApplied}
      notes={receipt && entryNotes(receipt.card)}
      paragraphs={receipt && new Map(receipt.card.map(entry => [entry.opIndex, entry.paragraphs]))}
    />
  );
  if (!receipt) {
    return (
      <>
        {progress.applyNote && (
          <Alert intent="warning" title="Some of it waits for you">
            {progress.applyNote}
          </Alert>
        )}
        {applied}
        {card}
      </>
    );
  }
  return (
    <OrganiseReceipt
      view={organiseReceiptView(receipt, notes)}
      applyNote={progress.applyNote}
      applied={applied}
      card={card}
      expanded={expanded}
      onToggle={() => setExpanded(open => !open)}
      left={left}
      busy={busy}
      onAdd={actions.addParagraph}
      onLeave={number => setLeft(current => new Set(current).add(number))}
    />
  );
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
  notes?: string;
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
  notes,
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
          <TurnReceipt
            novelId={novelId}
            appliedProposalId={message.appliedProposalId ?? undefined}
            proposalId={isPlan ? undefined : (message.proposalId ?? undefined)}
            held={held}
            onReview={() => actions.reviewInPanel(message.id)}
            onApplied={actions.onApplied}
          />
        )}
        {ownCard && message.proposalId && <ProposalSlot novelId={novelId} proposalId={message.proposalId} onApplied={actions.onApplied} />}
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
          <TranscriptJob key={job.id} novelId={novelId} job={job} stream={streamStatus} cancelling={cancellingJob === job.id} notes={notes} busy={busy} actions={actions} />
        ))}
      </div>
      {isPlan && message.proposalId && <TranscriptPlanCard novelId={novelId} proposalId={message.proposalId} nextChapter={nextChapter} actions={actions} />}
      {jobs.filter(isPlanJob).map(job => (
        <TranscriptPlanCard key={job.id} novelId={novelId} proposalId={job.progress.proposalId ?? ''} nextChapter={nextChapter} actions={actions} />
      ))}
    </>
  );
});
