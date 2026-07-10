/**
 * Importing npm packages
 */
import { Button, Dialog, FormField, Input, Select, Spinner, Textarea, toast } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ArchiveIcon, ProposalsIcon, SendIcon, TrashIcon } from '@/components/icons';
import { PaneError, PaneLoader, RowAction, StatusChip, detailPaneStyle, railStyle, splitPaneStyle } from '@/components/nf';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import {
  type ChatScope,
  type ChatSessionResponse,
  useChatMessagesQuery,
  useChatTurnMutation,
  useCreateChatSessionMutation,
  useListArcsQuery,
  useListBibleDocsQuery,
  useListChatSessionsQuery,
  useListVolumesQuery,
  useDeleteChatSessionMutation,
  useSetSessionStatusMutation,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/chat')({
  component: ChatScreen,
});

interface ScopeOption {
  value: ChatScope;
  label: string;
  hint: string;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { value: 'novel', label: 'Whole novel', hint: 'premise, volume plan, and the full catalog' },
  { value: 'volume_plan', label: 'Volume plan', hint: 'the full multi-volume structure' },
  { value: 'volume', label: 'A volume', hint: 'one volume and its arcs' },
  { value: 'arc_plan', label: 'Arc plan of a volume', hint: 'how a volume splits into arcs' },
  { value: 'arc', label: 'An arc', hint: 'one arc and its chapter briefs' },
  { value: 'brief', label: 'A chapter', hint: 'one chapter brief and its current draft' },
  { value: 'bible_document', label: 'A bible document', hint: 'one Story Bible document' },
];

/**
 * The new-chat dialog: the author picks the scope the chat reasons over (and the concrete volume /
 * arc / chapter / document when the scope needs one) so the backend assembles exactly that context.
 */
interface NewChatDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (s: ChatSessionResponse) => void;
}

function NewChatDialog({ novelId, open, onOpenChange, onCreated }: NewChatDialogProps): React.JSX.Element {
  const createSession = useCreateChatSessionMutation(novelId);
  const [scope, setScope] = useState<ChatScope>('novel');
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
    setScope('novel');
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
  const refRequired = scope !== 'novel' && scope !== 'volume_plan';
  const canCreate = !refRequired || Boolean(scopeRef);

  const defaultTitle = ((): string => {
    if (scope === 'volume' || scope === 'arc_plan') return volumes.find(v => v.volumeKey === volumeKey)?.title ?? volumeKey;
    if (scope === 'arc') return arcs.find(a => a.arcKey === arcKey)?.title ?? arcKey;
    if (scope === 'brief') return chapter ? `Chapter ${chapter}` : '';
    if (scope === 'bible_document') return doc;
    if (scope === 'volume_plan') return 'Volume plan';
    return 'Novel chat';
  })();

  const submit = (): void => {
    if (!canCreate) return;
    createSession.mutate(
      { scopeType: scope, scopeRef, title: title.trim() || defaultTitle || undefined },
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
        <Dialog.Header title="New refinement chat" description="Pick what the chat should reason over — that scope becomes its context." />
        <Dialog.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

interface ChatThreadProps {
  novelId: string;
  session: ChatSessionResponse;
}

function ChatThread({ novelId, session }: ChatThreadProps): React.JSX.Element {
  const navigate = useNavigate();
  const messagesQuery = useChatMessagesQuery(novelId, session.id);
  const turn = useChatTurnMutation(novelId, session.id);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, turn.isPending]);

  const send = (): void => {
    const content = input.trim();
    if (!content || turn.isPending) return;
    setInput('');
    turn.mutate(content, {
      onSuccess: result => {
        if (result.proposal) toast.success('Forge drafted a proposal — review it below the reply.');
      },
      onError: err => {
        toast.danger(err.message);
        setInput(content);
      },
    });
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flexShrink: 0,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 20px',
          borderBottom: '1px solid var(--sh-border-subtle)',
          background: 'var(--sh-surface-card)',
        }}
      >
        <StatusChip intent="info">scope: {session.scopeType}</StatusChip>
        {session.scopeRef && <StatusChip intent="neutral">{session.scopeRef}</StatusChip>}
        <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 700 }}>{session.title ?? 'Untitled chat'}</span>
        <StatusChip intent={session.status === 'active' ? 'success' : 'neutral'} dot>
          {session.status}
        </StatusChip>
      </div>

      <div ref={scrollRef} className="nf-scroll" style={{ flex: 1, minHeight: 0, padding: '24px 20px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messagesQuery.isLoading && <PaneLoader />}
          {messagesQuery.error && <PaneError error={messagesQuery.error} />}
          {!messagesQuery.isLoading && messages.length === 0 && (
            <p style={{ textAlign: 'center', fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)', lineHeight: 1.6 }}>
              Ask Forge to change this {session.scopeType}. It drafts a reviewable proposal — canon isn&apos;t edited directly.
            </p>
          )}
          {messages.map(m =>
            m.role === 'user' ? (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    maxWidth: '78%',
                    background: 'var(--sh-accent)',
                    color: 'var(--sh-on-accent)',
                    padding: '11px 14px',
                    borderRadius: '14px 14px 4px 14px',
                    fontSize: 'var(--sh-text-body)',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} style={{ display: 'flex', gap: 12 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'linear-gradient(140deg,var(--sh-indigo-500),var(--sh-indigo-700))',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}
                >
                  <ProposalsIcon size={15} />
                </div>
                <div style={{ maxWidth: '82%' }}>
                  <div
                    style={{
                      background: 'var(--sh-surface-card)',
                      border: '1px solid var(--sh-border-subtle)',
                      padding: '12px 15px',
                      borderRadius: '14px 14px 14px 4px',
                      fontSize: 'var(--sh-text-body)',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.content}
                  </div>
                  <MessageModelTag message={m} />
                  {m.proposalId && (
                    <button
                      onClick={() => navigate({ to: '/novels/$novelId/proposals', params: { novelId } })}
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 12px',
                        width: '100%',
                        background: 'var(--sh-warning-bg-subtle)',
                        border: '1px solid var(--sh-warning-border)',
                        borderRadius: 'var(--sh-radius-md)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <ProposalsIcon size={15} style={{ color: 'var(--sh-warning-solid)' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600 }}>Refinement proposal · pending</div>
                        <div style={{ fontSize: 11, color: 'var(--sh-text-tertiary)' }}>Review the change-set before it touches canon</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
          {turn.isPending && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--sh-text-tertiary)', fontSize: 'var(--sh-text-body-sm)' }}>
              <Spinner size="sm" /> Forge is thinking…
            </div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '14px 20px 18px', borderTop: '1px solid var(--sh-border-subtle)', background: 'var(--sh-surface-card)' }}>
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            border: '1px solid var(--sh-border-default)',
            borderRadius: 'var(--sh-radius-lg)',
            background: 'var(--sh-surface-app)',
            padding: '10px 12px',
          }}
        >
          <Textarea
            value={input}
            onValueChange={setInput}
            placeholder={`Ask for a change to this ${session.scopeType}…`}
            minRows={1}
            autoGrow
            disabled={session.status !== 'active'}
            style={{ border: 'none', background: 'transparent' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <ChatModelMenu novelId={novelId} session={session} scopeType={session.scopeType} disabled={session.status !== 'active'} />
            <span style={{ fontSize: 11, color: 'var(--sh-text-tertiary)' }}>Proposals only — canon isn&apos;t edited directly</span>
            <div style={{ flex: 1 }} />
            <Button variant="primary" size="sm" prefix={<SendIcon size={14} />} loading={turn.isPending} disabled={session.status !== 'active'} onClick={send}>
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
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const sessionsQuery = useListChatSessionsQuery(novelId, { status: statusFilter, limit: 50 });
  const setStatus = useSetSessionStatusMutation(novelId);
  const deleteSession = useDeleteChatSessionMutation(novelId);

  const sessions = sessionsQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionResponse | undefined>();

  useEffect(() => {
    if (!sessions.some(s => s.id === selectedId)) setSelectedId(sessions[0]?.id);
  }, [sessions, selectedId]);

  const selected = sessions.find(s => s.id === selectedId);

  const archive = (session: ChatSessionResponse): void => {
    setStatus.mutate({ sessionId: session.id, status: session.status === 'active' ? 'archived' : 'active' }, { onError: err => toast.danger(err.message) });
  };

  const doDelete = (): void => {
    if (!deleteTarget) return;
    deleteSession.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Deleted “${deleteTarget.title ?? 'chat'}” and its history`);
        setDeleteTarget(undefined);
        if (deleteTarget.id === selectedId) setSelectedId(undefined);
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <div style={splitPaneStyle}>
      {/* sessions */}
      <div style={railStyle}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sh-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 'var(--sh-text-body)', fontWeight: 700 }}>Refinement chats</span>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => setNewChatOpen(true)}>
              New
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['active', 'archived'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '3px 10px',
                  border: 'none',
                  borderRadius: 99,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: statusFilter === s ? 600 : 500,
                  background: statusFilter === s ? 'var(--sh-accent-soft)' : 'transparent',
                  color: statusFilter === s ? 'var(--sh-accent)' : 'var(--sh-text-secondary)',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="nf-scroll" style={{ flex: 1, padding: 8 }}>
          {sessionsQuery.isLoading && <PaneLoader />}
          {sessionsQuery.error && <PaneError error={sessionsQuery.error} />}
          {!sessionsQuery.isLoading && sessions.length === 0 && (
            <div style={{ padding: 16, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>
              {statusFilter === 'active' ? 'No chats yet — start one to refine the novel.' : 'No archived chats.'}
            </div>
          )}
          {sessions.map(session => {
            const active = session.id === selectedId;
            return (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(session.id)}
                onKeyDown={e => e.key === 'Enter' && setSelectedId(session.id)}
                className="nf-selrow"
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 4,
                  padding: 11,
                  marginBottom: 3,
                  background: active ? 'var(--sh-accent-soft)' : undefined,
                  boxShadow: active ? 'inset 2px 0 0 var(--sh-accent)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 22 }}>
                  <StatusChip intent="neutral">{session.scopeType}</StatusChip>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{relativeTime(session.lastTurnAt ?? session.updatedAt)}</span>
                  <div className="nf-rowactions">
                    <RowAction label={session.status === 'active' ? 'Archive chat' : 'Unarchive chat'} onClick={() => archive(session)}>
                      <ArchiveIcon size={13} />
                    </RowAction>
                    <RowAction label="Delete chat & history" danger onClick={() => setDeleteTarget(session)}>
                      <TrashIcon size={13} />
                    </RowAction>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 'var(--sh-text-body-sm)',
                    fontWeight: 600,
                    color: active ? 'var(--sh-accent)' : 'var(--sh-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: 'left',
                  }}
                >
                  {session.title ?? 'Untitled chat'}
                </div>
                {session.summary && (
                  <div style={{ fontSize: 11, color: 'var(--sh-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                    {session.summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* thread */}
      <div style={detailPaneStyle}>
        {selected ? (
          <ChatThread key={selected.id} novelId={novelId} session={selected} />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--sh-text-tertiary)' }}>
            <p style={{ margin: 0 }}>Start a refinement chat to talk through changes to your novel.</p>
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
          setSelectedId(session.id);
        }}
      />

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
