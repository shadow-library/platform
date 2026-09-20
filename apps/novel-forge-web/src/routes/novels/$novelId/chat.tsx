import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Input, SegmentedControl, Spinner, Textarea, toast } from '@shadow-library/ui';

import {
  ArchiveIcon,
  BookIcon,
  ChatIcon,
  ClockIcon,
  EditIcon,
  ListIcon,
  PlusIcon,
  ProposalsIcon,
  SearchIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
  TrashIcon,
  WarningIcon,
} from '@/components/icons';
import { type ChipIntent, CollectionPage, EmptyState, LookupTrace, Markdown, PaneError, PaneLoader, RowAction, SidePanel, StatusChip, TurnStatus } from '@/components/nf';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import {
  type ChangeItemResponse,
  type ChatMessageResponse,
  type ChatMode,
  type ChatSessionResponse,
  isTurnFailureRecorded,
  type ListChangesResponse,
  type ListProposalResponse,
  turnState,
  useApplyProposalMutation,
  useChatMessagesQuery,
  useChatTurnStream,
  useCreateChatSessionMutation,
  useDeleteChatSessionMutation,
  useDiscardProposalMutation,
  useInfiniteChatSessionsQuery,
  useListChangesQuery,
  useListChatSessionsQuery,
  useListProposalsQuery,
  useProjectQuery,
  useProposalQuery,
  useRevertProposalMutation,
  useRollbackMutation,
  useSetSessionStatusMutation,
  useUpdateChatSessionMutation,
} from '@/lib/apis';
import { bySession, chatChangesSummary, chatColumnView, chatHistoryView, chatTitle, matchesChatQuery } from '@/lib/chat-sessions';
import { groupByRecency, messageTime, projectTitle, relativeTime } from '@/lib/format';
import { defaultDeclined, isGuardedOp, NEVER_AUTO_NOTE, opLabel } from '@/lib/proposals';

import styles from './chat.module.css';
import { ChangeOpBody, PluginSourceChip } from './proposals';

interface ChatSearch {
  session?: string;
}

// `?session=new` is the chat that does not exist yet: the row is written on the first message, so until
// then there is nothing to name. Session ids are server-generated UUIDs, which can never spell `new`.
const DRAFT_SESSION = 'new';

// Matches the shell's own pending-proposal query, so the changes panel reads that cache rather than
// issuing a second request for the same rows.
const PENDING_PROPOSAL_LIMIT = 50;

const HISTORY_PAGE_SIZE = 25;

// The open chat lives in the URL so a refresh or shared link reopens the same conversation.
// No loader by design: the refinement chat is a live, streaming conversation whose data is
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

// Shared by the history row and the thread header: pre-filled and selected so typing replaces the title,
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

interface ChangeHistoryDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** What the chats changed, and the way back. Reached only from the changes panel — the header's History is the conversation list. */
function ChangeHistoryDialog({ novelId, open, onOpenChange }: ChangeHistoryDialogProps): React.JSX.Element {
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
            <div className={styles.changeList}>
              {changesQuery.isLoading && <PaneLoader />}
              {changesQuery.error && <PaneError error={changesQuery.error} />}
              {!changesQuery.isLoading && changes.length === 0 && <div className="nf-emptynote">No applied changes yet.</div>}
              {changes.map(change => (
                <div key={change.id} className={styles.changeRow} data-reverted={change.status === 'reverted'}>
                  <div className={styles.changeRowTop}>
                    <StatusChip intent={change.status === 'applied' ? 'success' : 'info'}>{change.status}</StatusChip>
                    <StatusChip intent="neutral">{change.kind}</StatusChip>
                    {change.autoApplied && <StatusChip intent="info">auto</StatusChip>}
                    <div className={styles.spacer} />
                    <span className={styles.changeTime}>{change.appliedAt ? relativeTime(change.appliedAt) : ''}</span>
                  </div>
                  <div className={styles.changeSummary}>{change.summary?.trim() || change.refs.join(', ') || 'pipeline actions'}</div>
                  {change.refs.length > 0 && <div className={styles.changeRefs}>{change.refs.join(' · ')}</div>}
                  <div className={styles.changeActions}>
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

const HISTORY_EMPTY: Record<'no-match' | 'no-archived' | 'no-chats', { icon: React.JSX.Element; title: string; description: string }> = {
  'no-match': { icon: <SearchIcon size={24} />, title: 'No chat matches that', description: 'Search reads the title and the summary of every conversation loaded so far.' },
  'no-archived': {
    icon: <ArchiveIcon size={24} />,
    title: 'No archived chats',
    description: 'Archiving a chat takes it off the active list without deleting anything it changed.',
  },
  'no-chats': { icon: <ChatIcon size={24} />, title: 'No chats yet', description: 'A chat is where you ask Forge to read, plan or rewrite anything in this novel.' },
};

interface ChatHistoryDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openSessionId?: string;
  onDeleted: (sessionId: string) => void;
}

/**
 * Every conversation, in one fixed 680×660 frame: search, Active/Archived, recency groups, and the
 * rename/archive/delete that used to live on the directory rows. The frame never resizes with its
 * contents — a list that shrinks under the pointer moves the row you were reaching for.
 */
function ChatHistoryDialog({ novelId, open, onOpenChange, openSessionId, onDeleted }: ChatHistoryDialogProps): React.JSX.Element {
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionResponse | undefined>();

  const pages = useInfiniteChatSessionsQuery(novelId, { status, limit: HISTORY_PAGE_SIZE }, open);
  const otherQuery = useListChatSessionsQuery(novelId, { status: status === 'active' ? 'archived' : 'active', limit: 1 }, open);
  const rename = useUpdateChatSessionMutation(novelId);
  const setSessionStatus = useSetSessionStatusMutation(novelId);
  const remove = useDeleteChatSessionMutation(novelId);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = pages;
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    // Re-armed after every page lands: a sentinel still in view once the rows above it settle has to ask
    // again, and an observer created while one fetch is in flight would fire a second for the same offset.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Ideation chats belong to the studio, not the hub; they are keyed by seed rather than novel, so this
  // only ever trims a stray, and the segment counts stay the server's own totals.
  const loaded = (pages.data?.pages ?? []).flatMap(page => page.items).filter(session => session.scopeType !== 'ideation');
  const matches = loaded.filter(session => matchesChatQuery(session, query));
  const groups = groupByRecency(matches, session => session.lastTurnAt ?? session.updatedAt);
  const view = chatHistoryView({ loading: pages.isLoading, error: Boolean(pages.error), matches: matches.length, query, status });

  const statusTotal = pages.data?.pages[0]?.total ?? 0;
  const otherTotal = otherQuery.data?.total ?? 0;
  const counts = status === 'active' ? { active: statusTotal, archived: otherTotal } : { active: otherTotal, archived: statusTotal };

  const doRename = (sessionId: string, title: string): void => {
    rename.mutate(
      { sessionId, title },
      {
        onSuccess: () => setRenamingId(undefined),
        onError: err => {
          setRenamingId(undefined);
          toast.danger(err.message);
        },
      },
    );
  };

  const doArchive = (session: ChatSessionResponse): void => {
    setSessionStatus.mutate({ sessionId: session.id, status: session.status === 'active' ? 'archived' : 'active' }, { onError: err => toast.danger(err.message) });
  };

  const doDelete = (): void => {
    if (!deleteTarget) return;
    const { id, title } = deleteTarget;
    remove.mutate(id, {
      onSuccess: () => {
        toast.success(`Deleted “${chatTitle({ id, title })}” and its history`);
        setDeleteTarget(undefined);
        onDeleted(id);
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <Dialog.Content size="lg" className={styles.historyPanel}>
          <Dialog.Header title="History" description="Every conversation with Forge about this novel." />
          <div className={styles.historyToolbar}>
            <Input
              className={styles.historySearch}
              type="search"
              size="sm"
              clearable
              aria-label="Search chats"
              placeholder="Search chats"
              prefix={<SearchIcon size={14} />}
              value={query}
              onValueChange={setQuery}
            />
            <SegmentedControl size="sm" aria-label="Chat status" value={status} onValueChange={value => setStatus(value as 'active' | 'archived')}>
              <SegmentedControl.Item value="active">
                Active<span className={styles.segmentCount}>{counts.active}</span>
              </SegmentedControl.Item>
              <SegmentedControl.Item value="archived">
                Archived<span className={styles.segmentCount}>{counts.archived}</span>
              </SegmentedControl.Item>
            </SegmentedControl>
          </div>
          <Dialog.Body>
            {view.kind === 'loading' && <PaneLoader />}
            {view.kind === 'error' && pages.error && <PaneError error={pages.error} />}
            {view.kind === 'empty' && <EmptyState {...HISTORY_EMPTY[view.reason]} />}
            {view.kind === 'rows' &&
              groups.map(group => (
                <section key={group.label} className={styles.historyGroup}>
                  <h3 className={styles.historyGroupLabel}>{group.label}</h3>
                  <CollectionPage.Rows actionReveal="always">
                    {group.items.map(session => {
                      const isRenaming = renamingId === session.id;
                      return (
                        <CollectionPage.Row
                          key={session.id}
                          link={
                            isRenaming ? undefined : <Link to="/novels/$novelId/chat" params={{ novelId }} search={{ session: session.id }} onClick={() => onOpenChange(false)} />
                          }
                          title={
                            isRenaming ? (
                              <RenameInput
                                label={`Rename “${chatTitle(session)}”`}
                                value={session.title ?? ''}
                                loading={rename.isPending}
                                onCommit={title => doRename(session.id, title)}
                                onCancel={() => setRenamingId(undefined)}
                              />
                            ) : (
                              chatTitle(session)
                            )
                          }
                          caption={!isRenaming && session.summary}
                          clampCaption
                          trailing={
                            !isRenaming && (
                              <>
                                {session.id === openSessionId && <StatusChip intent="accent">open</StatusChip>}
                                {session.mode === 'auto' && <StatusChip intent="info">auto</StatusChip>}
                              </>
                            )
                          }
                          meta={!isRenaming && relativeTime(session.lastTurnAt ?? session.updatedAt)}
                          actions={
                            <>
                              <RowAction label="Rename chat" onClick={() => setRenamingId(session.id)}>
                                <EditIcon size={13} />
                              </RowAction>
                              <RowAction label={session.status === 'active' ? 'Archive chat' : 'Unarchive chat'} onClick={() => doArchive(session)}>
                                <ArchiveIcon size={13} />
                              </RowAction>
                              <RowAction label="Delete chat & history" danger onClick={() => setDeleteTarget(session)}>
                                <TrashIcon size={13} />
                              </RowAction>
                            </>
                          }
                        />
                      );
                    })}
                  </CollectionPage.Rows>
                </section>
              ))}
            {/* Rendered whatever the body shows: a search that hides every loaded row still has to reach the pages behind it. */}
            {hasNextPage && (
              <div ref={sentinelRef} className={styles.historySentinel}>
                {isFetchingNextPage && <Spinner size="sm" label="Loading more chats" />}
              </div>
            )}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={o => !o && setDeleteTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title={`Delete “${deleteTarget ? chatTitle(deleteTarget) : 'this chat'}”?`}
            description="The conversation and its full history are removed permanently. Proposals it already staged are kept."
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={remove.isPending} onClick={doDelete}>
              Delete chat
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

interface ChatColumnProps {
  novelId: string;
  /** Absent until the first message creates one — the centred state, not a different screen. */
  session?: ChatSessionResponse;
  onOpenHistory: () => void;
  onNewChat: () => void;
  onStart: (content: string, mode: ChatMode) => void;
  // True while the session create this column handed off is in flight — locks the composer so a second
  // Enter or Send click can't spawn a second session from the same opening message.
  starting: boolean;
  // The just-created session's first message, queued by the screen — this is the one place a turn is
  // ever sent without the author touching this column's own composer.
  initialTurn?: string;
  onInitialTurnSent?: () => void;
}

/**
 * The conversation, in its two states. Centred while there is nothing in it, transcript-above-composer
 * once there is — one tree either way, so the draft, the focus and the model picker survive the move.
 */
function ChatColumn({ novelId, session, onOpenHistory, onNewChat, onStart, starting, initialTurn, onInitialTurnSent }: ChatColumnProps): React.JSX.Element {
  const projectQuery = useProjectQuery(novelId);
  const messagesQuery = useChatMessagesQuery(novelId, session?.id);
  const queryClient = useQueryClient();
  const turn = useChatTurnStream(novelId, session?.id ?? '');
  const updateSession = useUpdateChatSessionMutation(novelId);
  const [input, setInput] = useState('');
  const [draftMode, setDraftMode] = useState<ChatMode>('manual');
  const [renamingHeader, setRenamingHeader] = useState(false);
  // Where the transcript's assistant messages stood when this tab's turn began; the turn's own reply is the
  // first one past it. Zero until a turn is sent, which is also right for a session whose transcript has none.
  const [assistantWatermark, setAssistantWatermark] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = messagesQuery.data?.messages ?? [];
  const mode = session?.mode ?? draftMode;
  const isAuto = mode === 'auto';
  const name = projectQuery.data ? projectTitle(projectQuery.data) : 'this novel';
  // The composer locks on this tab's own request OR a turn the server still has running — the latter is
  // what lets a refresh or a second tab recover an in-flight turn instead of showing a silent message.
  const state = turnState(messagesQuery.data);
  // The stream is never cleared, so a finished turn's text would render twice — once live, once from the
  // refreshed transcript. The streamed row stands down on the transcript alone, the instant it carries an
  // assistant message past where this turn started: the reply reaches the transcript over the 1.5s status
  // poll, which is a separate race from the SSE frames, so either side can win and neither one alone is a
  // safe signal. Reading only the transcript covers both orders, and holds the reply on screen through the
  // gap between `done` and that refetch, when nothing else is showing it.
  const stream = turn.stream;
  // Once this tab has stopped its own turn, the server's view lags behind (its `pendingTurn` query only
  // clears once the run leaves `running`, and its `failedTurn` query never picks up a `cancelled` run at
  // all — that gap is server-side and out of this task's reach) and would otherwise keep reading as the
  // "just sent, still spinning up" stranded case for up to two minutes, wedging Send. The stream already
  // knows better the instant the cancel confirms, so it overrides the stale server read.
  const pending = turn.isPending || (state.kind === 'pending' && stream.status !== 'stopped');
  // This tab's own live turn, or — recovered after a refresh or from another tab, before this tab has sent
  // anything of its own — the one the transcript's own poll says is still running. Either way, what Stop targets.
  const activeRunId = turn.runId ?? (state.kind === 'pending' ? (state.pending?.runId ?? null) : null);
  const settled = lastAssistantOrdinal(messages) > assistantWatermark;
  // `stopped` always shows, even with no partial text yet, so pressing Stop always leaves a visible mark.
  const showStream = !settled && (stream.status === 'stopped' || stream.lookups.length > 0 || stream.reply.length > 0);
  // A live stream is its own progress indicator; `TurnStatus` stays for the failed-turn card, which owns the
  // reason and the retry while the streamed bubble only keeps whatever the model managed to say. A stopped
  // turn needs neither — the author asked for it, there is nothing to explain and nowhere to retry from.
  const showTurnStatus = !showStream || stream.status === 'failed';
  const view = chatColumnView({ messageCount: messages.length, loading: messagesQuery.isLoading, active: pending || showStream });
  const locked = session ? session.status !== 'active' : starting;

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
    if (!content) return;
    if (!session) {
      // The draft is kept, not cleared: a create that fails leaves the opening message where it was typed.
      // The turn that finally carries it clears it, in the `initialTurn` effect below.
      if (!starting) onStart(content, draftMode);
      return;
    }
    if (pending) return;
    setInput('');
    resend(content, content);
  };

  // A retry re-sends the message that never got an answer, so there is nothing in the composer to
  // restore on a second failure; the ordinary send passes its draft so a failure hands it back.
  const resend = (content: string, draft?: string): void => {
    if (!session || !content || pending) return;
    setAssistantWatermark(lastAssistantOrdinal(messages));
    turn.send(content, {
      onSuccess: result => {
        if (result.applied) {
          // A turn whose every op was declined applied nothing and left the proposal pending, so it is not
          // a success — only the note, naming the door the author has to walk through themselves, is true.
          if (result.applied.opResults.some(op => op.status === 'applied')) toast.success('Changes applied — revert anytime from the changes panel');
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

  const switchMode = (next: ChatMode): void => {
    if (!session) return void setDraftMode(next);
    updateSession.mutate({ sessionId: session.id, mode: next }, { onError: err => toast.danger(err.message) });
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

  // Fires once per freshly created session: the screen hands off the opening message and this column,
  // still mounted from the centred state, is the only place it can be sent. Clearing the parent's queue up
  // front — before the request settles — means a remount (StrictMode) never re-sends it.
  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (!initialTurn || sentInitialRef.current) return;
    sentInitialRef.current = true;
    onInitialTurnSent?.();
    setInput(current => (current === initialTurn ? '' : current));
    // Pass the content as the draft too: on an UNRECORDED failure (network error, 500 before the workflow
    // starts) there is no failed-turn card to retry from — the turn sender rolls a brand-new session's
    // optimistic message back to an empty transcript, so without this the author's opening message is
    // just gone. `resend` hands it back into this column's own composer.
    resend(initialTurn, initialTurn);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guarded by sentInitialRef; re-running on every resend identity change would defeat the once-only guard
  }, [initialTurn]);

  const fill = (prompt: string): void => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className={styles.column}>
      <div className={styles.head}>
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
          <button type="button" className={styles.headTitleButton} onClick={() => setRenamingHeader(true)}>
            {/* The namer runs alongside the first turn (ac3d730d), so a null title while that turn is
                still pending is genuinely being named, not just untitled — `state.kind` already tracks
                that turn for the composer lock, so this reuses it rather than adding a flag. */}
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
        <div className={styles.spacer} />
        <Button variant="ghost" size="sm" prefix={<ClockIcon size={14} />} onClick={onOpenHistory}>
          History
        </Button>
        <Button variant="primary" size="sm" prefix={<PlusIcon size={14} />} onClick={onNewChat}>
          New chat
        </Button>
      </div>

      {/* One flex column in two states: `data-view` moves the stack between centred and
          transcript-above-composer. Every branch below keeps its slot, so the composer element is never
          unmounted and the typed draft, the focus and the model picker survive the first turn. */}
      <div className={styles.body} data-view={view.kind}>
        <div ref={scrollRef} className={`nf-scroll ${styles.scroll}`}>
          <div className={styles.msgList}>
            {messagesQuery.isLoading && <PaneLoader />}
            {messagesQuery.error && <PaneError error={messagesQuery.error} />}
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
                    <Markdown
                      content={stream.reply}
                      className={
                        stream.status === 'failed'
                          ? `${styles.assistantBubble} ${styles.streamFailed}`
                          : stream.status === 'stopped'
                            ? `${styles.assistantBubble} ${styles.streamStopped}`
                            : styles.assistantBubble
                      }
                    />
                  )}
                  {stream.status === 'stopped' && <div className={styles.streamStoppedNote}>Stopped</div>}
                </div>
              </div>
            )}
            {showTurnStatus && <TurnStatus state={state} sending={turn.isPending} fallbackLabel={isAuto ? 'Forge is working' : 'Forge is reading your ask'} onRetry={resend} />}
          </div>
        </div>

        {view.kind === 'centred' && (
          <div className={styles.hero}>
            <h2 className={styles.heroTitle}>What are we working on?</h2>
            <p className={styles.heroSub}>
              Forge reads every part of “{name}” — canon, plans, and prose — and{' '}
              {isAuto ? 'applies changes as it goes, every one revertible' : 'checks with you before it changes anything'}.
            </p>
          </div>
        )}

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
              disabled={locked}
              className={styles.input}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className={styles.composerBar}>
              <ChatModelMenu novelId={novelId} session={session} disabled={locked} />
              <SegmentedControl value={mode} onValueChange={v => switchMode(v as ChatMode)} size="sm" disabled={locked}>
                <SegmentedControl.Item value="manual">Manual</SegmentedControl.Item>
                <SegmentedControl.Item value="auto">Auto</SegmentedControl.Item>
              </SegmentedControl>
              <span className={styles.hint}>{isAuto ? 'Auto — changes apply instantly, every one revertible' : 'Manual — you accept or decline each change'}</span>
              <div className={styles.spacer} />
              {pending && activeRunId ? (
                <Button variant="danger" size="sm" prefix={<StopIcon size={14} />} loading={turn.stopping} disabled={turn.stopping} onClick={stop}>
                  Stop
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  prefix={<SendIcon size={14} />}
                  loading={session ? pending : starting}
                  disabled={locked || pending || input.trim().length === 0}
                  onClick={send}
                >
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>

        {view.kind === 'centred' && (
          <div className={styles.suggestions}>
            {DRAFT_SUGGESTIONS.map(suggestion => (
              <Button key={suggestion.label} variant="secondary" size="sm" className={styles.suggestion} prefix={suggestion.icon} onClick={() => fill(suggestion.prompt)}>
                {suggestion.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChangesPanelProps {
  novelId: string;
  waiting: ListProposalResponse['items'];
  changed: ListChangesResponse['items'];
  onOpenChangeHistory: () => void;
}

/** The right-hand context panel: what this conversation changed, and the way back out of it. */
function ChangesPanel({ novelId, waiting, changed, onOpenChangeHistory }: ChangesPanelProps): React.JSX.Element {
  const revert = useRevertProposalMutation(novelId);

  const doRevert = (id: string): void => {
    revert.mutate(id, {
      onSuccess: r => toast.success(`Reverted ${r.reverted.length} artifact(s)`),
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <SidePanel
      className={styles.panel}
      title="Changes in this chat"
      titleAccessory={waiting.length > 0 ? <StatusChip intent="warning">{waiting.length}</StatusChip> : undefined}
      summary={chatChangesSummary(waiting.length, changed.length)}
      total={waiting.length + changed.length}
      empty="Nothing changed yet. When Forge proposes an edit it lands here, with a Revert beside it."
      footer={
        <Button variant="ghost" size="sm" onClick={onOpenChangeHistory}>
          Roll back to a point…
        </Button>
      }
    >
      {waiting.length > 0 && (
        <section className={styles.panelGroup}>
          <h3 className={styles.panelGroupLabel}>Waiting on you</h3>
          {waiting.map(proposal => (
            <div key={proposal.id} className={styles.panelRow}>
              <div className={styles.panelRowTop}>
                <StatusChip intent="warning">
                  {proposal.changeSet.length} change{proposal.changeSet.length === 1 ? '' : 's'}
                </StatusChip>
              </div>
              <div className={styles.panelRowSummary}>{proposal.summary?.trim() || 'Accept or decline it on the card in the transcript.'}</div>
            </div>
          ))}
        </section>
      )}

      {changed.length > 0 && (
        <section className={styles.panelGroup}>
          <h3 className={styles.panelGroupLabel}>Applied</h3>
          {changed.map(change => (
            <div key={change.id} className={styles.panelRow} data-reverted={change.status === 'reverted'}>
              <div className={styles.panelRowTop}>
                <StatusChip intent={change.status === 'applied' ? 'success' : 'info'}>{change.status}</StatusChip>
                <div className={styles.spacer} />
                <span className={styles.panelRowTime}>{change.appliedAt ? relativeTime(change.appliedAt) : ''}</span>
              </div>
              <div className={styles.panelRowSummary}>{change.summary?.trim() || change.refs.join(', ') || 'pipeline actions'}</div>
              {change.revertible && (
                <Button size="sm" variant="ghost" loading={revert.isPending} onClick={() => doRevert(change.id)}>
                  Revert
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
    </SidePanel>
  );
}

function ChatScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { session: sessionParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  // Unfiltered on purpose: the status filter belongs to the history modal, and resolving the open chat
  // against a filtered list would answer an archived link with whichever active chat happened to sort first.
  const sessionsQuery = useListChatSessionsQuery(novelId, { limit: 50 });
  const createSession = useCreateChatSessionMutation(novelId);
  // Same params as the shell's own pending-proposal query, so this reads that cache instead of fetching again.
  const proposalsQuery = useListProposalsQuery(novelId, { status: 'pending', limit: PENDING_PROPOSAL_LIMIT });
  const changesQuery = useListChangesQuery(novelId);
  // Bridges the gap between a create succeeding and the sessions list re-fetching to include the new row:
  // without it, `selected` would fall back to `sessions[0]` — a different chat — for one render.
  const [draftSession, setDraftSession] = useState<ChatSessionResponse>();
  // The opening message, queued for the one `ChatColumn` render that owns sending it.
  const [pendingFirstTurn, setPendingFirstTurn] = useState<{ sessionId: string; content: string }>();
  // A synchronous latch against a second create: `createSession.isPending` only becomes true once the
  // mutate call's internal dispatch runs, and both a very fast double-submit and a stray render in that
  // gap could otherwise slip a second `mutate` through. Held until `selectSession` actually resolves —
  // `isPending` (and so `starting` on the column) goes false the instant `onSuccess` runs, before the
  // navigation away from the draft has landed, and the composer re-enables in that window.
  const startingRef = useRef(false);
  // Which `startDraft` call is still current: `newChat` bumps it so an earlier, now-abandoned create's
  // `onSuccess` can tell it was superseded and skip navigating the author away from what they're doing now.
  const startRequestRef = useRef(0);
  // Bumped whenever the column must start over. It is the only thing that remounts the column, which is how
  // the centred composer survives becoming a conversation: the session it grows into keeps the same key.
  const [columnEpoch, setColumnEpoch] = useState(0);
  const [grownFromDraft, setGrownFromDraft] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changeHistoryOpen, setChangeHistoryOpen] = useState(false);

  // Ideation sessions belong to the studio, not the hub: renaming, archiving, deleting or flipping the mode
  // of one is refused with IDE_005, and its turns need the studio's own router and payload renderers.
  const sessions = (sessionsQuery.data?.items ?? []).filter(session => session.scopeType !== 'ideation');

  // The URL param wins when it names a session still in the list; otherwise fall back to the first
  // without rewriting the URL, so an implicit selection stays clean and refresh is deterministic.
  // `?session=new` outranks both — it means the author asked for a chat none of these rows can be.
  const selectSession = (id?: string): Promise<void> => navigate({ search: { session: id } });
  // The implicit pick stays the newest ACTIVE chat even though the list now carries archived ones too:
  // the list is sorted newest-first, so the first active row is it.
  const selected =
    sessionParam === DRAFT_SESSION
      ? undefined
      : (sessions.find(s => s.id === sessionParam) ?? (draftSession?.id === sessionParam ? draftSession : sessions.find(s => s.status === 'active')));

  // Once the invalidated sessions list actually carries the new row, the lookup above finds it on its own
  // — drop the stand-in during render (not an effect: this is adjusting state from props, not
  // synchronizing with an external system) so a later archive/delete of it isn't shadowed by a stale snapshot.
  if (draftSession && sessions.some(s => s.id === draftSession.id)) setDraftSession(undefined);

  const waiting = selected ? bySession(proposalsQuery.data?.items ?? [], selected.id) : [];
  const changed = selected ? bySession(changesQuery.data?.items ?? [], selected.id) : [];
  // The panel earns its place the first time this chat has a change and keeps it for the rest of the chat,
  // so declining the only pending proposal does not take the panel — and its Revert — away with it.
  const [panelSession, setPanelSession] = useState<string>();
  if (selected && panelSession !== selected.id && waiting.length + changed.length > 0) setPanelSession(selected.id);

  const resetColumn = (): void => {
    setColumnEpoch(epoch => epoch + 1);
    setGrownFromDraft(undefined);
  };

  const newChat = (): void => {
    // Invalidates any create still in flight: its `onSuccess` checks this token and, finding it stale,
    // leaves the author here instead of navigating them to a chat they didn't ask to open. The session it
    // created is not lost — it still lands in the list once the invalidation the mutation already does
    // resolves — just not auto-opened.
    startRequestRef.current += 1;
    startingRef.current = false;
    resetColumn();
    void selectSession(DRAFT_SESSION);
  };

  // The first message of a brand-new chat: create the session, then leave the column that typed it mounted
  // so the same turn-sending path sends it — never sent from here directly.
  const startDraft = (content: string, mode: ChatMode): void => {
    if (startingRef.current) return;
    startingRef.current = true;
    const requestId = (startRequestRef.current += 1);
    createSession.mutate(
      { mode },
      {
        onSuccess: async session => {
          if (startRequestRef.current !== requestId) return;
          setDraftSession(session);
          setGrownFromDraft(session.id);
          setPendingFirstTurn({ sessionId: session.id, content });
          // Held until the navigation away from the draft actually lands — releasing it on `onSuccess`
          // alone re-enables the still-mounted composer while `sessionParam` is still the draft sentinel,
          // letting a second Enter in that window fire a second create.
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

  // Deleting the open chat drops the author into the next active one, or into a fresh centred composer when
  // there is none; either way the column starts over rather than inheriting the dead chat's state.
  const onChatDeleted = (sessionId: string): void => {
    if (sessionId !== selected?.id) return;
    resetColumn();
    void selectSession(undefined);
  };

  const columnKey = selected && selected.id !== grownFromDraft ? selected.id : `draft-${columnEpoch}`;

  return (
    <div className={styles.screen}>
      <div className={styles.main}>
        <ChatColumn
          key={columnKey}
          novelId={novelId}
          session={selected}
          onOpenHistory={() => setHistoryOpen(true)}
          onNewChat={newChat}
          onStart={startDraft}
          starting={createSession.isPending}
          initialTurn={pendingFirstTurn?.sessionId === selected?.id ? pendingFirstTurn?.content : undefined}
          onInitialTurnSent={() => setPendingFirstTurn(undefined)}
        />
      </div>

      {selected && panelSession === selected.id && <ChangesPanel novelId={novelId} waiting={waiting} changed={changed} onOpenChangeHistory={() => setChangeHistoryOpen(true)} />}

      <ChatHistoryDialog novelId={novelId} open={historyOpen} onOpenChange={setHistoryOpen} openSessionId={selected?.id} onDeleted={onChatDeleted} />
      <ChangeHistoryDialog novelId={novelId} open={changeHistoryOpen} onOpenChange={setChangeHistoryOpen} />
    </div>
  );
}
