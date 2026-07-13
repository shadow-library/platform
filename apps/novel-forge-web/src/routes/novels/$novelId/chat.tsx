/**
 * Importing npm packages
 */
import { Button, Checkbox, Dialog, FormField, Input, SegmentedControl, Select, Spinner, Textarea, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ArchiveIcon, ProposalsIcon, SendIcon, TrashIcon } from '@/components/icons';
import { Markdown, PaneError, PaneLoader, RowAction, StatusChip, type ChipIntent } from '@/components/nf';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import {
  type ChangeItemResponse,
  type ChatScope,
  type ChatSessionResponse,
  useApplyProposalMutation,
  useChatMessagesQuery,
  useChatTurnMutation,
  useCreateChatSessionMutation,
  useDeleteChatSessionMutation,
  useDiscardProposalMutation,
  useListArcsQuery,
  useListBibleDocsQuery,
  useListChangesQuery,
  useListChatSessionsQuery,
  useListVolumesQuery,
  useProposalQuery,
  useRevertProposalMutation,
  useRollbackMutation,
  useSetSessionStatusMutation,
  useUpdateChatSessionMutation,
} from '@/lib/apis';
import { messageTime, relativeTime } from '@/lib/format';

import styles from './chat.module.css';
import { ChangeOpBody, opLabel } from './proposals';

interface ChatSearch {
  session?: string;
}

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

interface ScopeOption {
  value: ChatScope;
  label: string;
  hint: string;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { value: 'project', label: 'Control hub', hint: 'everything — canon, prose, and the pipeline itself' },
  { value: 'novel', label: 'Whole novel', hint: 'premise, volume plan, and the full catalog' },
  { value: 'volume_plan', label: 'Volume plan', hint: 'the full multi-volume structure' },
  { value: 'volume', label: 'A volume', hint: 'one volume and its arcs' },
  { value: 'arc_plan', label: 'Arc plan of a volume', hint: 'how a volume splits into arcs' },
  { value: 'arc', label: 'An arc', hint: 'one arc and its chapter briefs' },
  { value: 'brief', label: 'A chapter', hint: 'one chapter brief and its current draft' },
  { value: 'bible_document', label: 'A bible document', hint: 'one Story Bible document' },
];

const OP_RESULT_INTENT: Record<string, ChipIntent> = {
  applied: 'success',
  declined: 'neutral',
  failed: 'danger',
  pending: 'warning',
};

/**
 * The new-chat dialog: the author picks the scope the chat reasons over (and the concrete volume /
 * arc / chapter / document when the scope needs one) so the backend assembles exactly that context.
 * The Control hub scope sees everything and can also run the pipeline; its mode picks how changes land.
 */
interface NewChatDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (s: ChatSessionResponse) => void;
}

function NewChatDialog({ novelId, open, onOpenChange, onCreated }: NewChatDialogProps): React.JSX.Element {
  const createSession = useCreateChatSessionMutation(novelId);
  const [scope, setScope] = useState<ChatScope>('project');
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [volumeKey, setVolumeKey] = useState('');
  const [arcKey, setArcKey] = useState('');
  const [chapter, setChapter] = useState('');
  const [doc, setDoc] = useState('');
  const [title, setTitle] = useState('');

  const needsVolume = scope === 'volume' || scope === 'arc_plan' || scope === 'arc';
  const volumesQuery = useListVolumesQuery(novelId, { limit: 50 }, open && (needsVolume || scope === 'brief'));
  const arcsQuery = useListArcsQuery(novelId, volumeKey || undefined, open && scope === 'arc');
  const docsQuery = useListBibleDocsQuery(novelId, open && scope === 'bible_document');

  const volumes = volumesQuery.data?.items ?? [];
  const arcs = arcsQuery.data?.arcs ?? [];
  const docs = docsQuery.data?.docs ?? [];
  const chapters = volumes.flatMap(v =>
    v.startChapter != null && v.endChapter != null ? Array.from({ length: v.endChapter - v.startChapter + 1 }, (_, i) => (v.startChapter as number) + i) : [],
  );

  const reset = (): void => {
    setScope('project');
    setMode('manual');
    setVolumeKey('');
    setArcKey('');
    setChapter('');
    setDoc('');
    setTitle('');
  };

  const scopeRef = ((): string | undefined => {
    if (scope === 'volume' || scope === 'arc_plan') return volumeKey ? `volume:${volumeKey}` : undefined;
    if (scope === 'arc') return arcKey ? `arc:${arcKey}` : undefined;
    if (scope === 'brief') return chapter ? `chapter:${chapter}` : undefined;
    if (scope === 'bible_document') return doc ? `doc:${doc}` : undefined;
    return undefined;
  })();
  const refRequired = scope !== 'project' && scope !== 'novel' && scope !== 'volume_plan';
  const canCreate = !refRequired || Boolean(scopeRef);

  const defaultTitle = ((): string => {
    if (scope === 'volume' || scope === 'arc_plan') return volumes.find(v => v.volumeKey === volumeKey)?.title ?? volumeKey;
    if (scope === 'arc') return arcs.find(a => a.arcKey === arcKey)?.title ?? arcKey;
    if (scope === 'brief') return chapter ? `Chapter ${chapter}` : '';
    if (scope === 'bible_document') return doc;
    if (scope === 'volume_plan') return 'Volume plan';
    if (scope === 'novel') return 'Novel chat';
    return 'Control hub';
  })();

  const submit = (): void => {
    if (!canCreate) return;
    createSession.mutate(
      { scopeType: scope, scopeRef, title: title.trim() || defaultTitle || undefined, mode },
      {
        onSuccess: session => {
          onOpenChange(false);
          reset();
          onCreated(session);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Content size="md">
        <Dialog.Header title="New chat" description="Pick what the chat should reason over — that scope becomes its context." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <FormField label="Scope" helper={SCOPE_OPTIONS.find(o => o.value === scope)?.hint}>
              <Select
                value={scope}
                onValueChange={v => {
                  setScope(v as ChatScope);
                  setVolumeKey('');
                  setArcKey('');
                  setChapter('');
                  setDoc('');
                }}
              >
                {SCOPE_OPTIONS.map(o => (
                  <Select.Item key={o.value} value={o.value}>
                    {o.label}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <FormField label="Mode" helper={mode === 'auto' ? 'Changes apply immediately — everything stays revertible from History' : 'Every change waits for your per-op review'}>
              <SegmentedControl value={mode} onValueChange={v => setMode(v as 'manual' | 'auto')} size="sm">
                <SegmentedControl.Item value="manual">Manual review</SegmentedControl.Item>
                <SegmentedControl.Item value="auto">Auto apply</SegmentedControl.Item>
              </SegmentedControl>
            </FormField>
            {needsVolume && (
              <FormField label="Volume" required>
                <Select value={volumeKey} onValueChange={setVolumeKey} placeholder="Pick a volume" loading={volumesQuery.isLoading}>
                  {volumes.map(v => (
                    <Select.Item key={v.volumeKey} value={v.volumeKey}>
                      Vol {v.ordinal} · {v.title ?? v.volumeKey}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            )}
            {scope === 'arc' && (
              <FormField label="Arc" required>
                <Select
                  value={arcKey}
                  onValueChange={setArcKey}
                  placeholder={volumeKey ? 'Pick an arc' : 'Pick a volume first'}
                  disabled={!volumeKey}
                  loading={arcsQuery.isLoading}
                >
                  {arcs.map(a => (
                    <Select.Item key={a.arcKey} value={a.arcKey}>
                      {a.title ?? a.arcKey} (chs {a.chapterStart}–{a.chapterEnd})
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            )}
            {scope === 'brief' && (
              <FormField label="Chapter" required>
                <Select value={chapter} onValueChange={setChapter} placeholder="Pick a chapter" loading={volumesQuery.isLoading}>
                  {chapters.map(n => (
                    <Select.Item key={n} value={String(n)}>
                      Chapter {n}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            )}
            {scope === 'bible_document' && (
              <FormField label="Document" required>
                <Select value={doc} onValueChange={setDoc} placeholder="Pick a document" loading={docsQuery.isLoading}>
                  {docs.map(d => (
                    <Select.Item key={`${d.section}/${d.slug}`} value={`${d.section}/${d.slug}`}>
                      {d.section}/{d.slug}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label="Title" helper="Optional — defaults to the scope">
              <Input placeholder={defaultTitle || 'Untitled chat'} value={title} onValueChange={setTitle} />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={createSession.isPending} disabled={!canCreate} onClick={submit}>
            Start chat
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

/**
 * The inline review card under an assistant message that staged a change-set: per-op accept/decline
 * while pending, per-op results after apply, and a revert for applied changes. This is the manual
 * mode loop and the auto-mode receipt in one component.
 */
interface TurnProposalCardProps {
  novelId: string;
  proposalId: string;
}

function TurnProposalCard({ novelId, proposalId }: TurnProposalCardProps): React.JSX.Element | null {
  const proposalQuery = useProposalQuery(novelId, proposalId);
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const revert = useRevertProposalMutation(novelId);
  const [declined, setDeclined] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const proposal = proposalQuery.data;
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
    const opIndexes = selected.length === proposal.changeSet.length ? undefined : selected;
    apply.mutate(
      { proposalId: proposal.id, opIndexes },
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

/** The project-wide change history: every applied/reverted change with per-change revert and rollback-to-here. */
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
          <Dialog.Header title="Change history" description="Everything the chat (and the analysis passes) changed — newest first. Revert one change, or roll the project back to a point." />
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

interface ChatThreadProps {
  novelId: string;
  session: ChatSessionResponse;
  onOpenHistory: () => void;
}

function ChatThread({ novelId, session, onOpenHistory }: ChatThreadProps): React.JSX.Element {
  const messagesQuery = useChatMessagesQuery(novelId, session.id);
  const turn = useChatTurnMutation(novelId, session.id);
  const updateSession = useUpdateChatSessionMutation(novelId);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data?.messages ?? [];
  const isAuto = session.mode === 'auto';
  const isHub = session.scopeType === 'project';
  // "Forge is working" comes from this tab's own request OR the server flag — the latter is what lets a
  // refresh or a second tab recover an in-flight turn instead of showing a silent, unanswered message.
  const pending = turn.isPending || (messagesQuery.data?.pendingTurn ?? false);

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
    turn.mutate(content, {
      onSuccess: result => {
        if (result.applied) toast.success('Changes applied — revert anytime from History');
        else if (result.applyNote) toast.danger(result.applyNote);
        else if (result.proposal) toast.success('Forge drafted changes — review them below the reply.');
      },
      onError: err => {
        toast.danger(err.message);
        setInput(content);
      },
    });
  };

  const switchMode = (mode: 'manual' | 'auto'): void => {
    updateSession.mutate({ sessionId: session.id, mode }, { onError: err => toast.danger(err.message) });
  };

  return (
    <div className={styles.thread}>
      <div className={styles.threadHead}>
        <StatusChip intent="info">{isHub ? 'control hub' : `scope: ${session.scopeType}`}</StatusChip>
        {session.scopeRef && <StatusChip intent="neutral">{session.scopeRef}</StatusChip>}
        <span className={styles.threadTitle}>{session.title ?? 'Untitled chat'}</span>
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
              {isHub
                ? isAuto
                  ? 'Ask for anything — edits land immediately and every change is revertible from History.'
                  : 'Ask for anything — content edits, prose rewrites, or pipeline runs. You accept or decline each change.'
                : `Ask Forge to change this ${session.scopeType}. It drafts a reviewable proposal — canon isn't edited directly.`}
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
                  <ProposalsIcon size={15} />
                </div>
                <div className={styles.assistantCol}>
                  <Markdown content={m.content} className={styles.assistantBubble} />
                  <MessageModelTag message={m} />
                  {m.proposalId && <TurnProposalCard novelId={novelId} proposalId={m.proposalId} />}
                </div>
              </div>
            ),
          )}
          {pending && (
            <div className={styles.thinking}>
              <Spinner size="sm" /> {isAuto ? 'Forge is working…' : 'Forge is thinking…'}
            </div>
          )}
        </div>
      </div>

      <div className={styles.composer}>
        <div className={styles.composerInner}>
          <Textarea
            value={input}
            onValueChange={setInput}
            placeholder={isHub ? 'Ask for anything — edits, prose, pipeline runs…' : `Ask for a change to this ${session.scopeType}…`}
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
            <ChatModelMenu novelId={novelId} session={session} scopeType={session.scopeType} disabled={session.status !== 'active'} />
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

function ChatScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { session: sessionParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const sessionsQuery = useListChatSessionsQuery(novelId, { status: statusFilter, limit: 50 });
  const setStatus = useSetSessionStatusMutation(novelId);
  const deleteSession = useDeleteChatSessionMutation(novelId);

  const sessions = sessionsQuery.data?.items ?? [];
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionResponse | undefined>();

  // The URL param wins when it names a session still in the list; otherwise fall back to the first
  // without rewriting the URL, so an implicit selection stays clean and refresh is deterministic.
  const selectSession = (id?: string): Promise<void> => navigate({ search: { session: id } });
  const selected = sessions.find(s => s.id === sessionParam) ?? sessions[0];

  const archive = (session: ChatSessionResponse): void => {
    setStatus.mutate({ sessionId: session.id, status: session.status === 'active' ? 'archived' : 'active' }, { onError: err => toast.danger(err.message) });
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
            <Button variant="secondary" size="sm" onClick={() => setNewChatOpen(true)}>
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
          {sessions.map(session => (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              onClick={() => selectSession(session.id)}
              onKeyDown={e => e.key === 'Enter' && selectSession(session.id)}
              className="nf-selrow nf-selrow-stack"
              data-active={session.id === selected?.id}
            >
              <div className={styles.sessionTop}>
                <StatusChip intent="neutral">{session.scopeType === 'project' ? 'hub' : session.scopeType}</StatusChip>
                {session.mode === 'auto' && <StatusChip intent="info">auto</StatusChip>}
                <div className={styles.spacer} />
                <span className={styles.sessionTime}>{relativeTime(session.lastTurnAt ?? session.updatedAt)}</span>
                <div className="nf-rowactions">
                  <RowAction label={session.status === 'active' ? 'Archive chat' : 'Unarchive chat'} onClick={() => archive(session)}>
                    <ArchiveIcon size={13} />
                  </RowAction>
                  <RowAction label="Delete chat & history" danger onClick={() => setDeleteTarget(session)}>
                    <TrashIcon size={13} />
                  </RowAction>
                </div>
              </div>
              <div className={styles.sessionTitle}>{session.title ?? 'Untitled chat'}</div>
              {session.summary && <div className={styles.sessionSummary}>{session.summary}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* thread */}
      <div className="nf-detail">
        {selected ? (
          <ChatThread key={selected.id} novelId={novelId} session={selected} onOpenHistory={() => setHistoryOpen(true)} />
        ) : (
          <div className={styles.threadEmpty}>
            <p className={styles.emptyText}>Start a chat to control and refine your novel — the Control hub can touch everything.</p>
            <Button variant="primary" onClick={() => setNewChatOpen(true)}>
              New chat
            </Button>
          </div>
        )}
      </div>

      <NewChatDialog
        novelId={novelId}
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onCreated={session => {
          setStatusFilter('active');
          selectSession(session.id);
        }}
      />

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
