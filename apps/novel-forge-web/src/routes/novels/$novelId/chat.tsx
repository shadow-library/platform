import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Input, SegmentedControl, Spinner, Textarea, toast } from '@shadow-library/ui';

import { ArchiveIcon, BookIcon, EditIcon, ListIcon, ProposalsIcon, SearchIcon, SendIcon, SparkIcon, TrashIcon, WarningIcon } from '@/components/icons';
import { type ChipIntent, LookupTrace, Markdown, PaneError, PaneLoader, RowAction, StatusChip, TurnStatus } from '@/components/nf';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import {
  type ChangeItemResponse,
  type ChatMessageResponse,
  type ChatMode,
  type ChatSessionResponse,
  isTurnFailureRecorded,
  turnState,
  useApplyProposalMutation,
  useChatMessagesQuery,
  useChatTurnStream,
  useCreateChatSessionMutation,
  useDeleteChatSessionMutation,
  useDiscardProposalMutation,
  useListChangesQuery,
  useListChatSessionsQuery,
  useProjectQuery,
  useProposalQuery,
  useRevertProposalMutation,
  useRollbackMutation,
  useSetSessionStatusMutation,
  useUpdateChatSessionMutation,
} from '@/lib/apis';
import { groupByRecency, messageTime, projectTitle, relativeTime } from '@/lib/format';

import styles from './chat.module.css';
import { ChangeOpBody, defaultDeclined, isGuardedOp, NEVER_AUTO_NOTE, opLabel, PluginSourceChip } from './proposals';

interface ChatSearch {
  session?: string;
}

// `?session=new` is the chat that does not exist yet: the row is written on the first message, so until
// then there is nothing to name. Session ids are server-generated UUIDs, which can never spell `new`.
const DRAFT_SESSION = 'new';

// The open chat lives in the URL so a refresh or shared link reopens the same conversation.
// No loader by design (category D): the refinement chat is a live, streaming conversation whose data is
// session-selection driven — the session list, transcript, and pending-turn polling aren't needed for the
// first server paint. Project context is already seeded by the parent novel loader.
export const Route = createFileRoute('/novels/$novelId/chat')({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    session: typeof search.session === 'string' && search.session ? search.session : undefined,
  }),
  component: ChatScreen,
});

const OP_RESULT_INTENT: Record<string, ChipIntent> = {
  applied: 'success',
  declined: 'neutral',
  failed: 'danger',
  pending: 'warning',
};

interface RenameInputProps {
  label: string;
  value: string;
  loading: boolean;
  onCommit: (title: string) => void;
  onCancel: () => void;
  className?: string;
}

// Shared by the rail row and the thread header: pre-filled and selected so typing replaces the title,
// Enter/blur commit, Escape cancels. `settledRef` guards against an Escape's cancel and the blur that
// follows it (removing the input from the DOM) both firing — only the first one is allowed to act.
function RenameInput({ label, value, loading, onCommit, onCancel, className }: RenameInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const settledRef = useRef(false);

  const commit = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    const title = draft.trim();
    if (title && title !== value) onCommit(title);
    else onCancel();
  };

  const cancel = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <Input
      autoFocus
      size="sm"
      aria-label={label}
      className={className}
      value={draft}
      disabled={loading}
      onValueChange={setDraft}
      onFocus={e => e.target.select()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') cancel();
      }}
      onBlur={commit}
    />
  );
}

interface TurnProposalCardProps {
  novelId: string;
  proposalId: string;
}

function TurnProposalCard({ novelId, proposalId }: TurnProposalCardProps): React.JSX.Element | null {
  const proposalQuery = useProposalQuery(novelId, proposalId);
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const revert = useRevertProposalMutation(novelId);
  const proposal = proposalQuery.data;
  const [declined, setDeclined] = useState<Set<number>>(() => (proposal ? defaultDeclined(proposal.changeSet) : new Set<number>()));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // The selection is keyed to one proposal's op indexes, so a different proposal in the same slot resets
  // it during render rather than in an effect — an effect would paint one frame of the old selection.
  const [selectionFor, setSelectionFor] = useState(proposal?.id);
  if (proposal && selectionFor !== proposal.id) {
    setSelectionFor(proposal.id);
    setDeclined(defaultDeclined(proposal.changeSet));
  }

  if (proposalQuery.isLoading) return <Spinner size="sm" />;
  if (!proposal) return null;

  const isPending = proposal.status === 'pending';
  const opResults = (proposal.opResults ?? []) as { index: number; status: string; error?: string; result?: Record<string, unknown> }[];
  const revertible = proposal.revertible;

  const toggle = (set: Set<number>, index: number, update: (next: Set<number>) => void): void => {
    const next = new Set(set);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    update(next);
  };

  const doApply = (): void => {
    const selected = proposal.changeSet.map((_, i) => i).filter(i => !declined.has(i));
    if (selected.length === 0) return void toast.danger('Select at least one operation to apply');
    // Always explicit: a blanket apply (no `opIndexes`) is refused outright when the change-set holds a
    // one-way door, so naming the indexes is what makes finalize and graduation reachable at all.
    apply.mutate(
      { proposalId: proposal.id, opIndexes: selected },
      {
        onSuccess: r => {
          const failed = r.opResults.filter(o => o.status === 'failed');
          if (failed.length > 0) toast.danger(`Applied with ${failed.length} failed action(s)`);
          else toast.success('Changes applied to canon');
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <div className={styles.turnCard} data-status={proposal.status}>
      <div className={styles.turnCardHead}>
        <ProposalsIcon size={14} />
        <span className={styles.turnCardTitle}>
          {proposal.changeSet.length} change{proposal.changeSet.length === 1 ? '' : 's'}
        </span>
        <StatusChip intent={proposal.status === 'applied' ? 'success' : proposal.status === 'pending' ? 'warning' : proposal.status === 'conflicted' ? 'danger' : 'neutral'}>
          {proposal.status}
        </StatusChip>
        <PluginSourceChip proposal={proposal} />
        {proposal.autoApplied && <StatusChip intent="info">auto</StatusChip>}
      </div>

      <div className={styles.turnOps}>
        {proposal.changeSet.map((op, i) => {
          const result = opResults.find(r => r.index === i);
          const isAction = String(op.op).startsWith('action.');
          return (
            <div key={i} className={styles.turnOp} data-declined={declined.has(i)}>
              <div className={styles.turnOpRow}>
                {isPending && <Checkbox checked={!declined.has(i)} onCheckedChange={() => toggle(declined, i, setDeclined)} aria-label={`include ${opLabel(op)}`} />}
                <button className={styles.turnOpLabel} onClick={() => toggle(expanded, i, setExpanded)}>
                  {opLabel(op)}
                </button>
                {isAction && <StatusChip intent="info">action</StatusChip>}
                <div className={styles.spacer} />
                {result && <StatusChip intent={OP_RESULT_INTENT[result.status] ?? 'neutral'}>{result.status}</StatusChip>}
              </div>
              {isPending && isGuardedOp(op) && <div className={styles.turnOpNote}>{NEVER_AUTO_NOTE}</div>}
              {expanded.has(i) && <ChangeOpBody op={op} />}
              {result?.error && <div className={styles.turnOpError}>{result.error}</div>}
              {result?.result?.summary !== undefined && <div className={styles.turnOpSummary}>{String(result.result.summary)}</div>}
            </div>
          );
        })}
      </div>

      {proposal.status === 'conflicted' && <div className={styles.turnCardNote}>The canon moved on since this was drafted — ask again for a fresh change-set.</div>}
      {(isPending || revertible) && (
        <div className={styles.turnCardActions}>
          {isPending && (
            <>
              <Button size="sm" variant="primary" loading={apply.isPending} onClick={doApply}>
                {declined.size > 0 ? `Apply ${proposal.changeSet.length - declined.size} selected` : 'Apply'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={discard.isPending}
                onClick={() => discard.mutate(proposal.id, { onSuccess: () => toast.success('Declined'), onError: err => toast.danger(err.message) })}
              >
                Decline all
              </Button>
            </>
          )}
          {revertible && (
            <Button
              size="sm"
              variant="danger"
              loading={revert.isPending}
              onClick={() =>
                revert.mutate(proposal.id, {
                  onSuccess: r => toast.success(`Reverted ${r.reverted.length} artifact(s)`),
                  onError: err => toast.danger(err.message),
                })
              }
            >
              Revert
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface HistoryDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function HistoryDialog({ novelId, open, onOpenChange }: HistoryDialogProps): React.JSX.Element {
  const changesQuery = useListChangesQuery(novelId, open);
  const revert = useRevertProposalMutation(novelId);
  const rollback = useRollbackMutation(novelId);
  const [rollbackTarget, setRollbackTarget] = useState<ChangeItemResponse | undefined>();

  const changes = changesQuery.data?.items ?? [];

  const doRevert = (change: ChangeItemResponse): void => {
    revert.mutate(change.id, {
      onSuccess: r => toast.success(`Reverted ${r.reverted.length} artifact(s)`),
      onError: err => toast.danger(err.message),
    });
  };

  const doRollback = (): void => {
    if (!rollbackTarget) return;
    rollback.mutate(rollbackTarget.id, {
      onSuccess: r => {
        setRollbackTarget(undefined);
        if (r.stoppedAt) toast.danger(`Rolled back ${r.reverted.length} change(s), then stopped: a later change conflicts`);
        else toast.success(`Rolled back ${r.reverted.length} change(s)${r.skipped.length > 0 ? ` (${r.skipped.length} action-only skipped)` : ''}`);
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <Dialog.Content size="lg">
          <Dialog.Header
            title="Change history"
            description="Everything the chat (and the analysis passes) changed — newest first. Revert one change, or roll the project back to a point."
          />
          <Dialog.Body>
            <div className={styles.historyList}>
              {changesQuery.isLoading && <PaneLoader />}
              {changesQuery.error && <PaneError error={changesQuery.error} />}
              {!changesQuery.isLoading && changes.length === 0 && <div className="nf-emptynote">No applied changes yet.</div>}
              {changes.map(change => (
                <div key={change.id} className={styles.historyRow} data-reverted={change.status === 'reverted'}>
                  <div className={styles.historyRowTop}>
                    <StatusChip intent={change.status === 'applied' ? 'success' : 'info'}>{change.status}</StatusChip>
                    <StatusChip intent="neutral">{change.kind}</StatusChip>
                    {change.autoApplied && <StatusChip intent="info">auto</StatusChip>}
                    <div className={styles.spacer} />
                    <span className={styles.historyTime}>{change.appliedAt ? relativeTime(change.appliedAt) : ''}</span>
                  </div>
                  <div className={styles.historySummary}>{change.summary?.trim() || change.refs.join(', ') || 'pipeline actions'}</div>
                  {change.refs.length > 0 && <div className={styles.historyRefs}>{change.refs.join(' · ')}</div>}
                  <div className={styles.historyActions}>
                    {change.revertible && (
                      <Button size="sm" variant="ghost" loading={revert.isPending} onClick={() => doRevert(change)}>
                        Revert
                      </Button>
                    )}
                    {change.status === 'applied' && (
                      <Button size="sm" variant="ghost" onClick={() => setRollbackTarget(change)}>
                        Roll back to here
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog>

      <Dialog open={Boolean(rollbackTarget)} onOpenChange={o => !o && setRollbackTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title="Roll back to this point?"
            description="Every change applied after this one is reverted, newest first — across all chats. Action side effects (generated drafts, runs) are not undone."
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={rollback.isPending} onClick={doRollback}>
              Roll back
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </>
  );
}

function lastAssistantOrdinal(messages: ChatMessageResponse[]): number {
  return messages.reduce((ordinal, message) => (message.role === 'assistant' ? Math.max(ordinal, message.ordinal) : ordinal), 0);
}

interface ChatThreadProps {
  novelId: string;
  session: ChatSessionResponse;
  onOpenHistory: () => void;
  // The just-created session's first message, queued by the draft screen — this is the one place a turn
  // is ever sent without the author touching this thread's own composer.
  initialTurn?: string;
  onInitialTurnSent?: () => void;
}

function ChatThread({ novelId, session, onOpenHistory, initialTurn, onInitialTurnSent }: ChatThreadProps): React.JSX.Element {
  const messagesQuery = useChatMessagesQuery(novelId, session.id);
  const queryClient = useQueryClient();
  const turn = useChatTurnStream(novelId, session.id);
  const updateSession = useUpdateChatSessionMutation(novelId);
  const [input, setInput] = useState('');
  const [renamingHeader, setRenamingHeader] = useState(false);
  // Where the transcript's assistant messages stood when this tab's turn began; the turn's own reply is the
  // first one past it. Zero until a turn is sent, which is also right for a session whose transcript has none.
  const [assistantWatermark, setAssistantWatermark] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data?.messages ?? [];
  const isAuto = session.mode === 'auto';
  // The composer locks on this tab's own request OR a turn the server still has running — the latter is
  // what lets a refresh or a second tab recover an in-flight turn instead of showing a silent message.
  const state = turnState(messagesQuery.data);
  const pending = turn.isPending || state.kind === 'pending';
  // The stream is never cleared, so a finished turn's text would render twice — once live, once from the
  // refreshed transcript. The streamed row stands down on the transcript alone, the instant it carries an
  // assistant message past where this turn started: the reply reaches the transcript over the 1.5s status
  // poll, which is a separate race from the SSE frames, so either side can win and neither one alone is a
  // safe signal. Reading only the transcript covers both orders, and holds the reply on screen through the
  // gap between `done` and that refetch, when nothing else is showing it.
  const stream = turn.stream;
  const settled = lastAssistantOrdinal(messages) > assistantWatermark;
  const showStream = !settled && (stream.lookups.length > 0 || stream.reply.length > 0);
  // A live stream is its own progress indicator; `TurnStatus` stays for the failed-turn card, which owns the
  // reason and the retry while the streamed bubble only keeps whatever the model managed to say.
  const showTurnStatus = !showStream || stream.status === 'failed';

  // Stay pinned to the newest message ChatGPT-style: inline change cards load after the transcript,
  // so a one-shot scroll lands short — follow content growth while the user is near the bottom, and
  // stop following the moment they scroll up to read.
  const pinnedRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => {
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTo({ top: el.scrollHeight });
    });
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    pinnedRef.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, pending]);

  const send = (): void => {
    const content = input.trim();
    if (!content || pending) return;
    setInput('');
    resend(content, content);
  };

  // A retry re-sends the message that never got an answer, so there is nothing in the composer to
  // restore on a second failure; the ordinary send passes its draft so a failure hands it back.
  const resend = (content: string, draft?: string): void => {
    if (!content || pending) return;
    setAssistantWatermark(lastAssistantOrdinal(messages));
    turn.send(content, {
      onSuccess: result => {
        if (result.applied) {
          // A turn whose every op was declined applied nothing and left the proposal pending, so it is not
          // a success — only the note, naming the door the author has to walk through themselves, is true.
          if (result.applied.opResults.some(op => op.status === 'applied')) toast.success('Changes applied — revert anytime from History');
          if (result.applyNote) toast.warning(result.applyNote);
        } else if (result.applyNote) toast.danger(result.applyNote);
        else if (result.proposal) toast.success('Forge drafted changes — review them below the reply.');
      },
      // A failure the turn recorded shows as its own card, message kept and a retry offered; only one that never
      // reached the transcript needs the toast and the draft handed back.
      onError: async (err, context) => {
        if (await isTurnFailureRecorded(queryClient, novelId, session.id, context?.previous)) return;
        toast.danger(err.message);
        if (draft !== undefined) setInput(current => current || draft);
      },
    });
  };

  const switchMode = (mode: 'manual' | 'auto'): void => {
    updateSession.mutate({ sessionId: session.id, mode }, { onError: err => toast.danger(err.message) });
  };

  const renameSession = (title: string): void => {
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

  // Fires once per freshly created session: the draft screen hands off its content and unmounts, so this
  // is the only place it can be sent. Clearing the parent's queue up front — before the request settles —
  // means a remount (StrictMode, or the author bouncing back to this session) never re-sends it.
  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (!initialTurn || sentInitialRef.current) return;
    sentInitialRef.current = true;
    onInitialTurnSent?.();
    // Pass the content as the draft too: on an UNRECORDED failure (network error, 500 before the workflow
    // starts) there is no failed-turn card to retry from — the turn sender rolls a brand-new session's
    // optimistic message back to an empty transcript, so without this the author's opening message is
    // just gone. `resend` hands it back into this thread's own composer.
    resend(initialTurn, initialTurn);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guarded by sentInitialRef; re-running on every resend identity change would defeat the once-only guard
  }, [initialTurn]);

  return (
    <div className={styles.thread}>
      <div className={styles.threadHead}>
        {renamingHeader ? (
          <RenameInput
            label={`Rename “${session.title ?? 'New chat'}”`}
            value={session.title ?? ''}
            loading={updateSession.isPending}
            onCommit={renameSession}
            onCancel={() => setRenamingHeader(false)}
            className={styles.threadTitleInput}
          />
        ) : (
          <button type="button" className={styles.threadTitleButton} onClick={() => setRenamingHeader(true)}>
            {/* The namer runs alongside the first turn (ac3d730d), so a null title while that turn is
                still pending is genuinely being named, not just untitled — `state.kind` already tracks
                that turn for the composer lock, so this reuses it rather than adding a flag. */}
            <span className={styles.threadTitle}>{session.title ?? (state.kind === 'pending' ? 'Naming…' : 'New chat')}</span>
            <EditIcon size={13} className={styles.threadTitleEdit} />
          </button>
        )}
        <StatusChip intent={session.status === 'active' ? 'success' : 'neutral'} dot>
          {session.status}
        </StatusChip>
        <div className={styles.spacer} />
        <Button variant="ghost" size="sm" onClick={onOpenHistory}>
          History
        </Button>
      </div>

      <div ref={scrollRef} className={`nf-scroll ${styles.scroll}`}>
        <div className={styles.msgList}>
          {messagesQuery.isLoading && <PaneLoader />}
          {messagesQuery.error && <PaneError error={messagesQuery.error} />}
          {!messagesQuery.isLoading && messages.length === 0 && (
            <p className={styles.emptyHint}>
              {isAuto
                ? 'Ask for anything — edits land immediately and every change is revertible from History.'
                : 'Ask for anything — content edits, prose rewrites, or pipeline runs. You accept or decline each change.'}
            </p>
          )}
          {messages.map(m =>
            m.role === 'user' ? (
              <div key={m.id} className={styles.userRow}>
                <div className={styles.userCol}>
                  <div className={styles.userBubble}>{m.content}</div>
                  <time className={styles.userTime} dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString()}>
                    {messageTime(m.createdAt)}
                  </time>
                </div>
              </div>
            ) : (
              <div key={m.id} className={styles.assistantRow}>
                <div className={styles.avatar}>
                  <BookIcon size={15} />
                </div>
                <div className={styles.assistantCol}>
                  <Markdown content={m.content} className={styles.assistantBubble} />
                  <MessageModelTag message={m} />
                  {m.proposalId && <TurnProposalCard novelId={novelId} proposalId={m.proposalId} />}
                </div>
              </div>
            ),
          )}
          {showStream && (
            <div className={styles.assistantRow}>
              <div className={styles.avatar}>
                <BookIcon size={15} />
              </div>
              <div className={`${styles.assistantCol} ${styles.streamCol}`}>
                <LookupTrace lookups={stream.lookups} running={stream.status === 'streaming'} />
                {stream.reply && (
                  <Markdown content={stream.reply} className={stream.status === 'failed' ? `${styles.assistantBubble} ${styles.streamFailed}` : styles.assistantBubble} />
                )}
              </div>
            </div>
          )}
          {showTurnStatus && <TurnStatus state={state} sending={turn.isPending} fallbackLabel={isAuto ? 'Forge is working' : 'Forge is reading your ask'} onRetry={resend} />}
        </div>
      </div>

      <div className={styles.composer}>
        <div className={styles.composerInner}>
          <Textarea
            value={input}
            onValueChange={setInput}
            placeholder="Ask for anything — edits, prose, pipeline runs…"
            minRows={1}
            maxRows={6}
            autoGrow
            disabled={session.status !== 'active'}
            className={styles.input}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className={styles.composerBar}>
            <ChatModelMenu novelId={novelId} session={session} disabled={session.status !== 'active'} />
            <SegmentedControl value={session.mode} onValueChange={v => switchMode(v as 'manual' | 'auto')} size="sm" disabled={session.status !== 'active'}>
              <SegmentedControl.Item value="manual">Manual</SegmentedControl.Item>
              <SegmentedControl.Item value="auto">Auto</SegmentedControl.Item>
            </SegmentedControl>
            <span className={styles.hint}>{isAuto ? 'Auto — changes apply instantly, revertible from History' : 'Manual — you accept or decline each change'}</span>
            <div className={styles.spacer} />
            <Button variant="primary" size="sm" prefix={<SendIcon size={14} />} loading={pending} disabled={session.status !== 'active' || pending} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DraftSuggestion {
  label: string;
  prompt: string;
  icon: React.JSX.Element;
}

const DRAFT_SUGGESTIONS: DraftSuggestion[] = [
  {
    label: 'Check what canon says',
    prompt: 'What does canon currently say about my protagonist — traits, relationships, and everything that has changed about them across the volumes so far?',
    icon: <SearchIcon size={14} />,
  },
  {
    label: 'Plan the next arc',
    prompt: 'Look at where the story stands and propose the next arc: the chapters it spans, the beats it has to hit, and what it sets up for later.',
    icon: <ListIcon size={14} />,
  },
  {
    label: 'Write a chapter brief',
    prompt: 'Write the brief for the next chapter that has none — POV, scene beats, and the ending contract it has to land.',
    icon: <EditIcon size={14} />,
  },
  {
    label: 'Draft the next chapter',
    prompt: 'Generate a draft of the next unwritten chapter from its brief, then tell me where you departed from the plan and why.',
    icon: <SparkIcon size={14} />,
  },
  {
    label: 'Audit for contradictions',
    prompt: 'Audit the story bible against the drafts so far for contradictions — names, timeline, and facts that no longer line up — and list what needs fixing.',
    icon: <WarningIcon size={14} />,
  },
];

interface DraftChatProps {
  novelId: string;
  onStart?: (content: string, mode: ChatMode) => void;
  // True while the session create this draft handed off is in flight — locks the composer so a second
  // Enter or Send click can't spawn a second session from the same opening message.
  starting?: boolean;
}

function DraftChat({ novelId, onStart, starting = false }: DraftChatProps): React.JSX.Element {
  const projectQuery = useProjectQuery(novelId);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('manual');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isAuto = mode === 'auto';
  const name = projectQuery.data ? projectTitle(projectQuery.data) : 'this novel';
  const canStart = Boolean(onStart) && input.trim().length > 0 && !starting;

  const fill = (prompt: string): void => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const start = (): void => {
    if (!canStart) return;
    onStart?.(input.trim(), mode);
  };

  return (
    <div className={styles.thread}>
      <div className={`nf-scroll ${styles.scroll}`}>
        <div className={styles.hero}>
          <h2 className={styles.heroTitle}>What are we working on?</h2>
          <p className={styles.heroSub}>
            Forge reads every part of “{name}” — canon, plans, and prose — and{' '}
            {isAuto ? 'applies changes as it goes, every one revertible from History' : 'checks with you before it changes anything'}.
          </p>
          <div className={styles.suggestions}>
            {DRAFT_SUGGESTIONS.map(suggestion => (
              <Button key={suggestion.label} variant="secondary" size="sm" className={styles.suggestion} prefix={suggestion.icon} onClick={() => fill(suggestion.prompt)}>
                {suggestion.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.composer}>
        <div className={styles.composerInner}>
          <Textarea
            ref={inputRef}
            value={input}
            onValueChange={setInput}
            placeholder="Ask for anything — edits, prose, pipeline runs…"
            minRows={1}
            maxRows={6}
            autoGrow
            disabled={starting}
            className={styles.input}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                start();
              }
            }}
          />
          <div className={styles.composerBar}>
            <ChatModelMenu novelId={novelId} />
            <SegmentedControl value={mode} onValueChange={v => setMode(v as ChatMode)} size="sm" disabled={starting}>
              <SegmentedControl.Item value="manual">Manual</SegmentedControl.Item>
              <SegmentedControl.Item value="auto">Auto</SegmentedControl.Item>
            </SegmentedControl>
            <span className={styles.hint}>{isAuto ? 'Auto — changes apply instantly, revertible from History' : 'Manual — you accept or decline each change'}</span>
            <div className={styles.spacer} />
            <Button variant="primary" size="sm" prefix={<SendIcon size={14} />} loading={starting} disabled={!canStart} onClick={start}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { session: sessionParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const sessionsQuery = useListChatSessionsQuery(novelId, { status: statusFilter, limit: 50 });
  const setStatus = useSetSessionStatusMutation(novelId);
  const deleteSession = useDeleteChatSessionMutation(novelId);
  const createSession = useCreateChatSessionMutation(novelId);
  const renameSession = useUpdateChatSessionMutation(novelId);
  // The one row (if any) whose title is an editable input right now — never more than one at a time.
  const [renamingSessionId, setRenamingSessionId] = useState<string>();
  // Bridges the gap between a create succeeding and the sessions list re-fetching to include the new row:
  // without it, `selected` would fall back to `sessions[0]` — a different chat — for one render.
  const [draftSession, setDraftSession] = useState<ChatSessionResponse>();
  // The opening message, queued for the one `ChatThread` mount that owns sending it.
  const [pendingFirstTurn, setPendingFirstTurn] = useState<{ sessionId: string; content: string }>();
  // A synchronous latch against a second create: `createSession.isPending` only becomes true once the
  // mutate call's internal dispatch runs, and both a very fast double-submit and a stray render in that
  // gap could otherwise slip a second `mutate` through. Held until `selectSession` actually resolves —
  // `isPending` (and so `starting` on `DraftChat`) goes false the instant `onSuccess` runs, before the
  // navigation away from the draft screen has landed, and the composer re-enables in that window.
  const startingRef = useRef(false);
  // Which `startDraft` call is still current: `newChat` bumps it so an earlier, now-abandoned create's
  // `onSuccess` can tell it was superseded and skip navigating the author away from what they're doing now.
  const startRequestRef = useRef(0);

  // Ideation sessions belong to the studio, not the hub: renaming, archiving, deleting or flipping the mode
  // of one is refused with IDE_005, and its turns need the studio's own router and payload renderers.
  const sessions = (sessionsQuery.data?.items ?? []).filter(session => session.scopeType !== 'ideation');
  // The server sorts by `updatedAt`, which a rename, archive, or mode switch also bumps without
  // touching `lastTurnAt` — so a chat's row can move without it having been spoken to. Bucketing
  // reads `lastTurnAt ?? updatedAt` (recency is "last spoken to"), and `groupByRecency` re-sorts on
  // that same field before grouping so the two never disagree on order.
  const sessionGroups = groupByRecency(sessions, session => session.lastTurnAt ?? session.updatedAt);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionResponse | undefined>();

  // The URL param wins when it names a session still in the list; otherwise fall back to the first
  // without rewriting the URL, so an implicit selection stays clean and refresh is deterministic.
  // The draft sentinel outranks both — it means the author asked for a chat none of these rows can be.
  const selectSession = (id?: string): Promise<void> => navigate({ search: { session: id } });
  const selected = sessionParam === DRAFT_SESSION ? undefined : (sessions.find(s => s.id === sessionParam) ?? (draftSession?.id === sessionParam ? draftSession : sessions[0]));

  // Once the invalidated sessions list actually carries the new row, the lookup above finds it on its own
  // — drop the stand-in during render (not an effect: this is adjusting state from props, not
  // synchronizing with an external system) so a later archive/delete of it isn't shadowed by a stale snapshot.
  if (draftSession && sessions.some(s => s.id === draftSession.id)) setDraftSession(undefined);

  const newChat = (): void => {
    setStatusFilter('active');
    // Invalidates any create still in flight: its `onSuccess` checks this token and, finding it stale,
    // leaves the author here instead of navigating them to a chat they didn't ask to open. The session it
    // created is not lost — it still lands in the rail once the list invalidation the mutation already
    // does resolves — just not auto-opened.
    startRequestRef.current += 1;
    startingRef.current = false;
    void selectSession(DRAFT_SESSION);
  };

  // The first message of a brand-new chat: create the session, then hand its content to the `ChatThread`
  // that mounts for it so the same turn-sending path sends it — never sent from here directly.
  const startDraft = (content: string, mode: ChatMode): void => {
    if (startingRef.current) return;
    startingRef.current = true;
    const requestId = (startRequestRef.current += 1);
    createSession.mutate(
      { mode },
      {
        onSuccess: async session => {
          if (startRequestRef.current !== requestId) return;
          setStatusFilter('active');
          setDraftSession(session);
          setPendingFirstTurn({ sessionId: session.id, content });
          // Held until the navigation away from the draft screen actually lands — releasing it on
          // `onSuccess` alone re-enables the still-mounted `DraftChat` composer while `sessionParam` is
          // still the draft sentinel, letting a second Enter in that window fire a second create.
          await selectSession(session.id);
          startingRef.current = false;
        },
        onError: err => {
          if (startRequestRef.current === requestId) startingRef.current = false;
          toast.danger(err.message);
        },
      },
    );
  };

  const archive = (session: ChatSessionResponse): void => {
    setStatus.mutate({ sessionId: session.id, status: session.status === 'active' ? 'archived' : 'active' }, { onError: err => toast.danger(err.message) });
  };

  const rename = (sessionId: string, title: string): void => {
    renameSession.mutate(
      { sessionId, title },
      {
        onSuccess: () => setRenamingSessionId(undefined),
        onError: err => {
          setRenamingSessionId(undefined);
          toast.danger(err.message);
        },
      },
    );
  };

  const doDelete = (): void => {
    if (!deleteTarget) return;
    deleteSession.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Deleted “${deleteTarget.title ?? 'chat'}” and its history`);
        setDeleteTarget(undefined);
        if (deleteTarget.id === sessionParam) selectSession(undefined);
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <div className="nf-splitpane">
      {/* sessions */}
      <div className="nf-rail">
        <div className="nf-railhead">
          <div className={styles.railTitleRow}>
            <span className={styles.railTitle}>Chats</span>
            <div className={styles.spacer} />
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
              History
            </Button>
            <Button variant="secondary" size="sm" onClick={newChat}>
              New
            </Button>
          </div>
          <div className={styles.filterRow}>
            {(['active', 'archived'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={styles.filterPill} data-active={statusFilter === s}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="nf-scroll nf-raillist">
          {sessionsQuery.isLoading && <PaneLoader />}
          {sessionsQuery.error && <PaneError error={sessionsQuery.error} />}
          {!sessionsQuery.isLoading && sessions.length === 0 && (
            <div className="nf-emptynote">{statusFilter === 'active' ? 'No chats yet — start one to run the whole novel.' : 'No archived chats.'}</div>
          )}
          {sessionGroups.map(group => (
            <div key={group.label} className={styles.railGroup}>
              <h3 className={styles.railGroupHeading}>{group.label}</h3>
              {group.items.map(session => (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectSession(session.id)}
                  onKeyDown={e => e.key === 'Enter' && selectSession(session.id)}
                  className="nf-selrow nf-selrow-flat"
                  data-active={session.id === selected?.id}
                >
                  <div className={styles.sessionTop}>
                    {session.mode === 'auto' && <StatusChip intent="info">auto</StatusChip>}
                    {renamingSessionId === session.id ? (
                      <RenameInput
                        label={`Rename “${session.title ?? 'New chat'}”`}
                        value={session.title ?? ''}
                        loading={renameSession.isPending}
                        onCommit={title => rename(session.id, title)}
                        onCancel={() => setRenamingSessionId(undefined)}
                        className={styles.sessionTitleInput}
                      />
                    ) : (
                      <div className={styles.sessionTitle}>{session.title ?? 'New chat'}</div>
                    )}
                    <div className="nf-selrow-meta">
                      <span className="nf-selrow-meta-time">{relativeTime(session.lastTurnAt ?? session.updatedAt)}</span>
                      <div className="nf-rowactions">
                        <RowAction label="Rename chat" onClick={() => setRenamingSessionId(session.id)}>
                          <EditIcon size={13} />
                        </RowAction>
                        <RowAction label={session.status === 'active' ? 'Archive chat' : 'Unarchive chat'} onClick={() => archive(session)}>
                          <ArchiveIcon size={13} />
                        </RowAction>
                        <RowAction label="Delete chat & history" danger onClick={() => setDeleteTarget(session)}>
                          <TrashIcon size={13} />
                        </RowAction>
                      </div>
                    </div>
                  </div>
                  {session.summary && renamingSessionId !== session.id && <div className={styles.sessionSummary}>{session.summary}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* thread */}
      <div className="nf-detail">
        {selected ? (
          <ChatThread
            key={selected.id}
            novelId={novelId}
            session={selected}
            onOpenHistory={() => setHistoryOpen(true)}
            initialTurn={pendingFirstTurn?.sessionId === selected.id ? pendingFirstTurn.content : undefined}
            onInitialTurnSent={() => setPendingFirstTurn(undefined)}
          />
        ) : (
          <DraftChat novelId={novelId} onStart={startDraft} starting={createSession.isPending} />
        )}
      </div>

      <HistoryDialog novelId={novelId} open={historyOpen} onOpenChange={setHistoryOpen} />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={o => !o && setDeleteTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title={`Delete “${deleteTarget?.title ?? 'this chat'}”?`}
            description="The conversation and its full history are removed permanently. Proposals it already staged are kept."
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteSession.isPending} onClick={doDelete}>
              Delete chat
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
}
