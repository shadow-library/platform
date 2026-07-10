/**
 * Importing npm packages
 */
import { Button, Drawer, IconButton, SegmentedControl, Spinner, Tooltip, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ChevronLeftIcon, ChevronRightIcon, EditIcon, PlusIcon, WarningIcon } from '@/components/icons';
import { PaneError, PaneLoader, QueryState, StatusChip, type ChipIntent } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import {
  type DraftResponse,
  useApproveDraftMutation,
  useDraftQuery,
  useGenerateMutation,
  useListDraftsQuery,
  useListJobsQuery,
  useListRunsQuery,
  useUpdateDraftMutation,
} from '@/lib/apis';

export const Route = createFileRoute('/novels/$novelId/chapters')({
  component: ChaptersScreen,
});

type ReviewStatus = DraftResponse['reviewStatus'];

interface StatusMeta {
  intent: ChipIntent;
  label: string;
}

const STATUS_META: Record<ReviewStatus, StatusMeta> = {
  generating: { intent: 'info', label: 'Generating' },
  needs_review: { intent: 'warning', label: 'Needs review' },
  contradiction: { intent: 'danger', label: 'Conflict' },
  approved: { intent: 'success', label: 'Approved' },
  final: { intent: 'success', label: 'Final' },
};

function statusMeta(draft: DraftResponse): StatusMeta {
  if (draft.status === 'final') return { intent: 'success', label: 'Final' };
  return STATUS_META[draft.reviewStatus] ?? { intent: 'neutral', label: 'Draft' };
}

function wordCount(body?: string | null): number {
  if (!body) return 0;
  return body.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Inline prose formatting ────────────────────────────────────────────────────
// Prose is stored as plain text with lightweight inline marks (**bold**, *italic*, <u>underline</u>)
// so it stays readable to the LLM pipeline and the manuscript, while the reader renders real styles.

function renderInline(text: string): React.ReactNode[] {
  const pattern = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|<u>([\s\S]*?)<\/u>/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={key++}>{renderInline(match[1])}</strong>);
    else if (match[2] !== undefined) nodes.push(<em key={key++}>{renderInline(match[2])}</em>);
    else if (match[3] !== undefined) nodes.push(<u key={key++}>{renderInline(match[3])}</u>);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const RUN_INTENT: Record<string, ChipIntent> = {
  running: 'info',
  completed: 'success',
  awaiting_review: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
};

/**
 * The in-app generation progress screen: shown as soon as a generate job is triggered, it follows
 * the job and its per-chapter workflow runs live until the drafts land.
 */
interface GenerationProgressProps {
  novelId: string;
  jobId: string;
  onBack: () => void;
}

function GenerationProgress({ novelId, jobId, onBack }: GenerationProgressProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const jobsQuery = useListJobsQuery(novelId, true, { refetchInterval: 2500 });
  const runsQuery = useListRunsQuery(novelId, true, { refetchInterval: 2500 });
  const job = jobsQuery.data?.items.find(j => j.id === jobId);
  const runs = (runsQuery.data?.items ?? []).filter(r => r.jobId === jobId);
  const finished = job?.status === 'done' || job?.status === 'failed';
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!finished || notifiedRef.current) return;
    notifiedRef.current = true;
    queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'drafts'] });
    if (job?.status === 'done') toast.success(`Chapter${job.target.includes(',') ? 's' : ''} ${job?.target} drafted`);
    else toast.danger(job?.lastError ?? 'Generation failed');
  }, [finished, job, novelId, queryClient]);

  const chapters = job?.target ? job.target.split(',') : [];

  return (
    <div className="nf-scroll" style={{ position: 'absolute', inset: 0, background: 'var(--sh-surface-app)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 32px 90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          {!finished ? <Spinner size="md" /> : null}
          <h1 style={{ margin: 0, fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {finished ? (job?.status === 'done' ? 'Generation complete' : 'Generation failed') : 'Generating…'}
          </h1>
        </div>
        <p style={{ margin: '0 0 28px', fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>
          {chapters.length > 0 ? `Chapter${chapters.length > 1 ? 's' : ''} ${job?.target}` : 'Preparing the next chapter'} · drafted in order, judged, then queued for your review.
        </p>

        <div
          style={{ background: 'var(--sh-surface-card)', border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', padding: '18px 20px', marginBottom: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 700 }}>Job {jobId.slice(0, 8)}</span>
            <StatusChip intent={job?.status === 'done' ? 'success' : job?.status === 'failed' ? 'danger' : 'info'} dot>
              {job?.status ?? 'pending'}
            </StatusChip>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--sh-text-tertiary)' }}>target: {job?.target ?? '…'}</span>
          </div>
          {job?.lastError && (
            <pre style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-danger-text-on-subtle)' }}>
              {job.lastError}
            </pre>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {runs.length === 0 && !finished && (
            <div style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>Waiting for the first workflow run to start…</div>
          )}
          {runs.map(run => (
            <div
              key={run.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--sh-surface-card)',
                border: '1px solid var(--sh-border-subtle)',
                borderRadius: 'var(--sh-radius-md)',
                padding: '11px 14px',
              }}
            >
              {run.status === 'running' ? <Spinner size="sm" /> : null}
              <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600 }}>
                {run.graph} · {run.target}
              </span>
              <div style={{ flex: 1 }} />
              <StatusChip intent={RUN_INTENT[run.status] ?? 'neutral'} dot={run.status !== 'running'}>
                {run.status}
              </StatusChip>
            </div>
          ))}
        </div>

        <Button variant={finished ? 'primary' : 'secondary'} onClick={onBack}>
          {finished ? 'View chapters' : 'Back to chapters'}
        </Button>
      </div>
    </div>
  );
}

type Filter = 'all' | 'needs_review' | 'draft' | 'final';

interface ChapterListProps {
  novelId: string;
  onOpen: (n: number) => void;
  onProgress: (jobId: string) => void;
}

function ChapterList({ novelId, onOpen, onProgress }: ChapterListProps): React.JSX.Element {
  const draftsQuery = useListDraftsQuery(novelId);
  const generate = useGenerateMutation(novelId);
  const jobsQuery = useListJobsQuery(novelId);
  const [filter, setFilter] = useState<Filter>('all');
  const drafts = useMemo(() => [...(draftsQuery.data?.items ?? [])].sort((a, b) => a.chapter - b.chapter), [draftsQuery.data]);
  const activeJob = jobsQuery.data?.items.find(j => j.kind === 'generate' && (j.status === 'pending' || j.status === 'in_progress'));

  const startGeneration = (): void => {
    generate.mutate({ limit: 1 }, { onSuccess: job => onProgress(job.jobId), onError: e => toast.danger(e.message) });
  };

  const counts = {
    all: drafts.length,
    needs_review: drafts.filter(d => d.reviewStatus === 'needs_review' || d.reviewStatus === 'contradiction').length,
    draft: drafts.filter(d => d.status === 'draft').length,
    final: drafts.filter(d => d.status === 'final').length,
  };
  const visible = drafts.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'needs_review') return d.reviewStatus === 'needs_review' || d.reviewStatus === 'contradiction';
    return d.status === filter;
  });
  const totalWords = drafts.reduce((sum, d) => sum + wordCount(d.body), 0);

  return (
    <div className="nf-scroll" style={{ position: 'absolute', inset: 0, background: 'var(--sh-surface-app)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '44px 32px 90px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 5px', fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>Chapters</h1>
            <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>
              {drafts.length} drafts · {totalWords.toLocaleString()} words
            </p>
          </div>
          <Button variant="primary" loading={generate.isPending} prefix={<PlusIcon />} onClick={startGeneration}>
            Generate next
          </Button>
        </div>

        {activeJob && (
          <button
            onClick={() => onProgress(activeJob.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              marginTop: 14,
              padding: '11px 14px',
              background: 'var(--sh-info-bg-subtle)',
              border: '1px solid var(--sh-info-border)',
              borderRadius: 'var(--sh-radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Spinner size="sm" />
            <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600 }}>Generating chapter {activeJob.target} — view progress</span>
          </button>
        )}

        <div style={{ margin: '26px 0 4px' }}>
          <SegmentedControl value={filter} onValueChange={v => setFilter(v as Filter)}>
            <SegmentedControl.Item value="all">All {counts.all}</SegmentedControl.Item>
            <SegmentedControl.Item value="needs_review">Needs review {counts.needs_review}</SegmentedControl.Item>
            <SegmentedControl.Item value="draft">Drafts {counts.draft}</SegmentedControl.Item>
            <SegmentedControl.Item value="final">Final {counts.final}</SegmentedControl.Item>
          </SegmentedControl>
        </div>

        <QueryState
          isLoading={draftsQuery.isLoading}
          error={draftsQuery.error}
          isEmpty={drafts.length === 0}
          emptyTitle="No chapters drafted yet"
          emptyDescription="Generate your first chapter from its brief."
          emptyAction={{ label: 'Generate first chapter', onClick: startGeneration }}
        >
          <div style={{ marginTop: 8 }}>
            {visible.map(draft => {
              const meta = statusMeta(draft);
              return (
                <button
                  key={draft.id}
                  className="nf-selrow"
                  onClick={() => onOpen(draft.chapter)}
                  style={{ gap: 16, padding: '15px 12px', borderRadius: 0, borderBottom: '1px solid var(--sh-border-subtle)' }}
                >
                  <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-text-tertiary)', width: 22, flexShrink: 0 }}>
                    {String(draft.chapter).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 'var(--sh-text-body)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textAlign: 'left',
                    }}
                  >
                    {draft.title ?? 'Untitled chapter'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--sh-text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 80, textAlign: 'right' }}>
                    {wordCount(draft.body).toLocaleString()} words
                  </span>
                  <span style={{ width: 118, flexShrink: 0, display: 'flex', justifyContent: 'flex-start' }}>
                    <StatusChip intent={meta.intent} dot>
                      {meta.label}
                    </StatusChip>
                  </span>
                  <ChevronRightIcon size={16} style={{ color: 'var(--sh-text-placeholder)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </QueryState>
      </div>
    </div>
  );
}

interface ReviewDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: DraftResponse;
}

function ReviewDrawer({ open, onOpenChange, draft }: ReviewDrawerProps): React.JSX.Element {
  const meta = statusMeta(draft);
  const clean = draft.reviewStatus === 'approved' || draft.reviewStatus === 'final';
  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="right" size="sm">
      <Drawer.Header title="Judge review" meta={draft.judge ?? undefined} />
      <Drawer.Body>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 14px',
            borderRadius: 'var(--sh-radius-md)',
            marginBottom: 18,
            background: clean ? 'var(--sh-success-bg-subtle)' : draft.reviewStatus === 'contradiction' ? 'var(--sh-danger-bg-subtle)' : 'var(--sh-warning-bg-subtle)',
          }}
        >
          <WarningIcon
            size={17}
            style={{
              color: meta.intent === 'success' ? 'var(--sh-success-solid)' : meta.intent === 'danger' ? 'var(--sh-danger-solid)' : 'var(--sh-warning-solid)',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 700 }}>{meta.label}</div>
            <div style={{ fontSize: 11, color: 'var(--sh-text-secondary)' }}>{clean ? 'Re-validated against the bible' : 'Judge flagged this draft'}</div>
          </div>
        </div>
        {draft.judgeNote ? (
          <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', lineHeight: 1.55 }}>{draft.judgeNote}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)', lineHeight: 1.55 }}>No judge notes recorded for this draft.</p>
        )}
      </Drawer.Body>
    </Drawer>
  );
}

interface ChapterSwitchDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  novelId: string;
  current: number;
  onPick: (n: number) => void;
}

function ChapterSwitchDrawer({ open, onOpenChange, novelId, current, onPick }: ChapterSwitchDrawerProps): React.JSX.Element {
  const draftsQuery = useListDraftsQuery(novelId, open);
  const drafts = [...(draftsQuery.data?.items ?? [])].sort((a, b) => a.chapter - b.chapter);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="left" size="sm">
      <Drawer.Header title="Chapters" />
      <Drawer.Body>
        {drafts.map(d => {
          const meta = statusMeta(d);
          const active = d.chapter === current;
          return (
            <button
              key={d.id}
              className="nf-selrow"
              onClick={() => {
                onPick(d.chapter);
                onOpenChange(false);
              }}
              style={{ background: active ? 'var(--sh-accent-soft)' : undefined }}
            >
              <span
                style={{
                  fontFamily: 'var(--sh-font-mono)',
                  fontSize: 11,
                  color: active ? 'var(--sh-accent)' : 'var(--sh-text-tertiary)',
                  width: 18,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {String(d.chapter).padStart(2, '0')}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--sh-text-body-sm)',
                  color: active ? 'var(--sh-accent)' : 'var(--sh-text-secondary)',
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textAlign: 'left',
                }}
              >
                {d.title ?? 'Untitled'}
              </span>
              {(d.reviewStatus === 'needs_review' || d.reviewStatus === 'contradiction') && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.intent === 'danger' ? 'var(--sh-danger-solid)' : 'var(--sh-warning-solid)' }} />
              )}
            </button>
          );
        })}
      </Drawer.Body>
    </Drawer>
  );
}

/**
 * The prose editor's formatting toolbar: wraps the current selection in the inline marks the reader
 * renders (bold / italic / underline), plus the punctuation novelists reach for constantly.
 */
interface ProseToolbarProps {
  onWrap: (prefix: string, suffix: string) => void;
  onInsert: (text: string) => void;
}

interface ToolbarButton {
  label: React.ReactNode;
  title: string;
  action: () => void;
}

function ProseToolbar({ onWrap, onInsert }: ProseToolbarProps): React.JSX.Element {
  const buttons: ToolbarButton[] = [
    { label: <strong>B</strong>, title: 'Bold (⌘B)', action: () => onWrap('**', '**') },
    { label: <em>I</em>, title: 'Italic (⌘I)', action: () => onWrap('*', '*') },
    { label: <u>U</u>, title: 'Underline (⌘U)', action: () => onWrap('<u>', '</u>') },
    { label: '—', title: 'Em dash', action: () => onInsert('—') },
    { label: '…', title: 'Ellipsis', action: () => onInsert('…') },
    { label: '“ ”', title: 'Curly quotes', action: () => onWrap('“', '”') },
    { label: '＊＊＊', title: 'Scene break', action: () => onInsert('\n\n***\n\n') },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        border: '1px solid var(--sh-border-subtle)',
        borderRadius: 'var(--sh-radius-md)',
        background: 'var(--sh-surface-card)',
        marginBottom: 10,
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      {buttons.map((b, i) => (
        <Tooltip key={i} content={b.title}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={b.action}
            aria-label={b.title}
            style={{
              minWidth: 30,
              height: 28,
              padding: '0 8px',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--sh-text-secondary)',
            }}
          >
            {b.label}
          </button>
        </Tooltip>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>**bold** · *italic* · &lt;u&gt;underline&lt;/u&gt;</span>
    </div>
  );
}

interface ChapterEditorProps {
  novelId: string;
  chapter: number;
  onBack: () => void;
  onPick: (n: number) => void;
}

function ChapterEditor({ novelId, chapter, onBack, onPick }: ChapterEditorProps): React.JSX.Element {
  const draftQuery = useDraftQuery(novelId, chapter);
  const updateDraft = useUpdateDraftMutation(novelId, chapter);
  const approveDraft = useApproveDraftMutation(novelId);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const draft = draftQuery.data;

  // The editor is the reading view made editable — same typography, no field chrome. Text lives in
  // the DOM while editing (plaintext-only contentEditable) so the caret survives keystrokes; React
  // only seeds it when editing starts and reads it back on save.
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.textContent = draft?.body ?? '';
      editorRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (draftQuery.isLoading) return <PaneLoader />;
  if (draftQuery.error) return <PaneError error={draftQuery.error} />;
  if (!draft) return <PaneLoader />;

  const meta = statusMeta(draft);
  const canApprove = draft.reviewStatus !== 'contradiction' && draft.reviewStatus !== 'generating' && draft.status !== 'final';

  // Formatting operates on the live selection; execCommand keeps the browser's undo stack intact.
  const selectionInEditor = (): Selection | null => {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (!sel || !el || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return null;
    return sel;
  };

  const wrapSelection = (prefix: string, suffix: string): void => {
    const sel = selectionInEditor();
    if (!sel) return void editorRef.current?.focus();
    document.execCommand('insertText', false, prefix + sel.toString() + suffix);
  };

  const insertText = (text: string): void => {
    if (!selectionInEditor()) editorRef.current?.focus();
    document.execCommand('insertText', false, text);
  };

  const onEditorKeyDown = (e: React.KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') wrapSelection('**', '**');
    else if (key === 'i') wrapSelection('*', '*');
    else if (key === 'u') wrapSelection('<u>', '</u>');
    else return;
    e.preventDefault();
  };

  const save = (): void => {
    const body = editorRef.current?.textContent ?? draft.body ?? '';
    updateDraft.mutate(
      { body, title: draft.title ?? undefined },
      {
        onSuccess: () => {
          toast.success('Draft saved');
          setEditing(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const approve = (): void => {
    approveDraft.mutate(chapter, { onSuccess: () => toast.success(`Chapter ${chapter} approved`), onError: err => toast.danger(err.message) });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--sh-surface-app)', overflow: 'hidden' }}>
      <div style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px 0 14px' }}>
        <Tooltip content="Back to chapters">
          <IconButton variant="ghost" aria-label="Back to chapters" icon={<ChevronLeftIcon size={18} />} onClick={onBack} />
        </Tooltip>
        <button className="nf-nav" onClick={() => setChaptersOpen(true)} style={{ width: 'auto', gap: 10, padding: '7px 12px 7px 6px' }}>
          <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-text-tertiary)' }}>{String(chapter).padStart(2, '0')}</span>
          <span style={{ fontSize: 'var(--sh-text-body)', fontWeight: 600, whiteSpace: 'nowrap' }}>{draft.title ?? 'Untitled chapter'}</span>
          <ChevronRightIcon size={15} style={{ color: 'var(--sh-text-tertiary)' }} />
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setReviewOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            height: 34,
            padding: '0 13px',
            border: 'none',
            borderRadius: 999,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            background: meta.intent === 'success' ? 'var(--sh-success-bg-subtle)' : meta.intent === 'danger' ? 'var(--sh-danger-bg-subtle)' : 'var(--sh-warning-bg-subtle)',
            color:
              meta.intent === 'success' ? 'var(--sh-success-text-on-subtle)' : meta.intent === 'danger' ? 'var(--sh-danger-text-on-subtle)' : 'var(--sh-warning-text-on-subtle)',
          }}
        >
          {meta.label}
        </button>
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={updateDraft.isPending} onClick={save}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Tooltip content="Edit prose">
              <IconButton variant="ghost" aria-label="Edit prose" icon={<EditIcon size={17} />} onClick={() => setEditing(true)} />
            </Tooltip>
            <Button variant="primary" size="sm" disabled={!canApprove} loading={approveDraft.isPending} onClick={approve}>
              Approve draft
            </Button>
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {editing ? (
          <div className="nf-scroll" style={{ position: 'absolute', inset: 0 }}>
            <div style={{ maxWidth: 648, margin: '0 auto', padding: '20px 32px 120px' }} onKeyDown={onEditorKeyDown}>
              <ProseToolbar onWrap={wrapSelection} onInsert={insertText} />
              <div
                ref={editorRef}
                contentEditable="plaintext-only"
                suppressContentEditableWarning
                spellCheck
                aria-label="Chapter prose"
                style={{
                  outline: 'none',
                  whiteSpace: 'pre-wrap',
                  minHeight: '60vh',
                  fontSize: 19,
                  lineHeight: 1.85,
                  fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif",
                  caretColor: 'var(--sh-accent)',
                }}
              />
            </div>
          </div>
        ) : (
          <div className="nf-scroll" style={{ position: 'absolute', inset: 0 }}>
            <article
              style={{
                maxWidth: 648,
                margin: '0 auto',
                padding: '64px 32px 120px',
                fontSize: 19,
                lineHeight: 1.85,
                fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif",
              }}
            >
              {draft.title && (
                <div
                  style={{
                    fontFamily: 'var(--sh-font-sans)',
                    fontSize: 12,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--sh-text-tertiary)',
                    marginBottom: 26,
                  }}
                >
                  Chapter {chapter}
                </div>
              )}
              {draft.body ? (
                draft.body.split(/\n{2,}/).map((para, i) =>
                  para.trim() === '***' ? (
                    <div key={i} style={{ textAlign: 'center', letterSpacing: '0.6em', color: 'var(--sh-text-tertiary)', margin: '0 0 26px' }}>
                      ***
                    </div>
                  ) : (
                    <p key={i} style={{ margin: '0 0 26px' }}>
                      {renderInline(para)}
                    </p>
                  ),
                )
              ) : (
                <p style={{ color: 'var(--sh-text-tertiary)' }}>This chapter has no prose yet. Use “Edit prose” to write it, or generate a draft from its brief.</p>
              )}
            </article>
          </div>
        )}

        {!editing && (
          <div style={{ position: 'absolute', left: 22, bottom: 20, fontSize: 11, color: 'var(--sh-text-tertiary)', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
            {wordCount(draft.body).toLocaleString()} words
          </div>
        )}

        {!editing && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: 22,
              width: 'min(680px, calc(100% - 60px))',
              display: 'flex',
              justifyContent: 'center',
              zIndex: 5,
            }}
          >
            <ForgeBar
              novelId={novelId}
              scope={{ type: 'brief', ref: `chapter:${chapter}`, title: draft.title ?? `Chapter ${chapter}` }}
              placeholder={`Ask Forge to revise ${draft.title ?? `chapter ${chapter}`} — tighten a scene, fix continuity, adjust the ending…`}
            />
          </div>
        )}
      </div>

      <ReviewDrawer open={reviewOpen} onOpenChange={setReviewOpen} draft={draft} />
      <ChapterSwitchDrawer open={chaptersOpen} onOpenChange={setChaptersOpen} novelId={novelId} current={chapter} onPick={onPick} />
    </div>
  );
}

function ChaptersScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const [openChapter, setOpenChapter] = useState<number | undefined>();
  const [progressJobId, setProgressJobId] = useState<string | undefined>();

  if (progressJobId) return <GenerationProgress novelId={novelId} jobId={progressJobId} onBack={() => setProgressJobId(undefined)} />;
  return openChapter != null ? (
    <ChapterEditor novelId={novelId} chapter={openChapter} onBack={() => setOpenChapter(undefined)} onPick={setOpenChapter} />
  ) : (
    <ChapterList novelId={novelId} onOpen={setOpenChapter} onProgress={setProgressJobId} />
  );
}
