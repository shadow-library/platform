import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Input, SegmentedControl, Spinner, toast } from '@shadow-library/ui';

import { ArchiveIcon, ChatIcon, EditIcon, SearchIcon, TrashIcon } from '@/components/icons';
import { CollectionPage, EmptyState, PaneError, PaneLoader, RowAction, StatusChip } from '@/components/nf';
import { ChatColumn, RenameInput } from '@/features/chat';
import {
  type ChangeItemResponse,
  type ChatSessionResponse,
  useCreateChatSessionMutation,
  useDeleteChatSessionMutation,
  useInfiniteChatSessionsQuery,
  useListChangesQuery,
  useListChatSessionsQuery,
  useRevertProposalMutation,
  useRollbackMutation,
  useSetSessionStatusMutation,
  useUpdateChatSessionMutation,
} from '@/lib/apis';
import { chatHistoryView, chatTitle, matchesChatQuery } from '@/lib/chat-sessions';
import { groupByRecency, relativeTime } from '@/lib/format';

import styles from './chat.module.css';

interface ChatSearch {
  session?: string;
}

// `?session=new` is the chat that does not exist yet: the row is written on the first message, so until
// then there is nothing to name. Session ids are server-generated UUIDs, which can never spell `new`.
const DRAFT_SESSION = 'new';

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

  const loaded = (pages.data?.pages ?? []).flatMap(page => page.items);
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
                                {session.mode === 'manual' && <StatusChip intent="warning">manual</StatusChip>}
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

function ChatScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { session: sessionParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  // Unfiltered on purpose: the status filter belongs to the history modal, and resolving the open chat
  // against a filtered list would answer an archived link with whichever active chat happened to sort first.
  const sessionsQuery = useListChatSessionsQuery(novelId, { limit: 50 });
  const createSession = useCreateChatSessionMutation(novelId);
  // Bridges the gap between a create succeeding and the sessions list re-fetching to include the new row:
  // without it, `selected` would fall back to `sessions[0]` — a different chat — for one render.
  const [draftSession, setDraftSession] = useState<ChatSessionResponse>();
  // The opening message, queued for the one `ChatColumn` render that owns sending it.
  const [pendingFirstTurn, setPendingFirstTurn] = useState<{ sessionId: string; content: string }>();
  // A synchronous latch against a second create, held until `selectSession` actually resolves: `isPending`
  // goes false the instant `onSuccess` runs, before the navigation away from the draft has landed.
  const startingRef = useRef(false);
  // Which `startDraft` call is still current: `newChat` bumps it so an abandoned create's `onSuccess` skips navigating.
  const startRequestRef = useRef(0);
  // Bumped whenever the column must start over. It is the only thing that remounts the column, which is how
  // the centred composer survives becoming a conversation: the session it grows into keeps the same key.
  const [columnEpoch, setColumnEpoch] = useState(0);
  const [grownFromDraft, setGrownFromDraft] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changeHistoryOpen, setChangeHistoryOpen] = useState(false);

  const sessions = sessionsQuery.data?.items ?? [];

  // The URL param wins when it names a session still in the list; otherwise fall back to the newest active
  // chat without rewriting the URL. `?session=new` outranks both — it means the author asked for a chat none of these rows can be.
  const selectSession = (id?: string): Promise<void> => navigate({ search: { session: id } });
  const selected =
    sessionParam === DRAFT_SESSION
      ? undefined
      : (sessions.find(s => s.id === sessionParam) ?? (draftSession?.id === sessionParam ? draftSession : sessions.find(s => s.status === 'active')));

  // Once the invalidated sessions list carries the new row, the lookup above finds it on its own — drop the
  // stand-in during render so a later archive/delete of it isn't shadowed by a stale snapshot.
  if (draftSession && sessions.some(s => s.id === draftSession.id)) setDraftSession(undefined);

  const resetColumn = (): void => {
    setColumnEpoch(epoch => epoch + 1);
    setGrownFromDraft(undefined);
  };

  const newChat = (): void => {
    // Invalidates any create still in flight: its `onSuccess` finds this token stale and leaves the author here.
    startRequestRef.current += 1;
    startingRef.current = false;
    resetColumn();
    void selectSession(DRAFT_SESSION);
  };

  // The first message of a brand-new chat: create the session, then leave the column that typed it mounted
  // so the same turn-sending path sends it — never sent from here directly.
  const startDraft = (content: string): void => {
    if (startingRef.current) return;
    startingRef.current = true;
    const requestId = (startRequestRef.current += 1);
    createSession.mutate(
      {},
      {
        onSuccess: async session => {
          if (startRequestRef.current !== requestId) return;
          setDraftSession(session);
          setGrownFromDraft(session.id);
          setPendingFirstTurn({ sessionId: session.id, content });
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
      <ChatColumn
        key={columnKey}
        novelId={novelId}
        session={selected}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenChanges={() => setChangeHistoryOpen(true)}
        onNewChat={newChat}
        onStart={startDraft}
        starting={createSession.isPending}
        initialTurn={pendingFirstTurn?.sessionId === selected?.id ? pendingFirstTurn?.content : undefined}
        onInitialTurnSent={() => setPendingFirstTurn(undefined)}
      />

      <ChatHistoryDialog novelId={novelId} open={historyOpen} onOpenChange={setHistoryOpen} openSessionId={selected?.id} onDeleted={onChatDeleted} />
      <ChangeHistoryDialog novelId={novelId} open={changeHistoryOpen} onOpenChange={setChangeHistoryOpen} />
    </div>
  );
}
