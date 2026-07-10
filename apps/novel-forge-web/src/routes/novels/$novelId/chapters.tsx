/**
 * Importing npm packages
 */
import { Button, Dialog, Drawer, DropdownMenu, IconButton, SegmentedControl, Spinner, Tooltip, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, PlusIcon, TrashIcon, WarningIcon } from '@/components/icons';
import { PAGE_MAX_WIDTH, PaneError, PaneLoader, QueryState, RowAction, StatusChip, type ChipIntent } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import {
  type DraftResponse,
  useApproveDraftMutation,
  useDeleteDraftMutation,
  useDraftQuery,
  useExtractToBibleMutation,
  useGenerateMutation,
  useJudgeDraftMutation,
  useListBriefsQuery,
  useListDraftsQuery,
  useListJobsQuery,
  useListRunsQuery,
  useProjectStatusQuery,
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

// ─── Prose formatting ───────────────────────────────────────────────────────────
// Chapter prose is authored and stored as GitHub-flavored Markdown (bold, italic, lists, tables); the
// reading view and the editor's Preview tab render it the same way.
marked.setOptions({ gfm: true, breaks: true });

// Rendered Markdown is sanitized (DOMPurify) so an imported/AI chapter carrying raw <script>/handlers
// can never execute in the author's browser.
function renderMarkdown(md: string | null | undefined): { __html: string } {
  return { __html: DOMPurify.sanitize(marked.parse(md ?? '', { async: false }) as string) };
}

// Defense in depth: strip dangerous HTML from the Markdown source before it is persisted, so the stored
// manuscript stays clean regardless of where the prose came from.
function sanitizeSource(md: string): string {
  return DOMPurify.sanitize(md);
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
  const briefsQuery = useListBriefsQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);
  const generate = useGenerateMutation(novelId);
  const jobsQuery = useListJobsQuery(novelId);
  const [filter, setFilter] = useState<Filter>('all');
  const drafts = useMemo(() => [...(draftsQuery.data?.items ?? [])].sort((a, b) => a.chapter - b.chapter), [draftsQuery.data]);
  const activeJob = jobsQuery.data?.items.find(j => j.kind === 'generate' && (j.status === 'pending' || j.status === 'in_progress'));

  // The next chapter is the lowest brief with no draft yet — exactly what the backend's `generate`
  // targets — so a manually-written chapter automatically advances the target to the next hole.
  const drafted = useMemo(() => new Set(drafts.map(d => d.chapter)), [drafts]);
  const briefs = useMemo(() => [...(briefsQuery.data?.items ?? [])].sort((a, b) => a.chapter - b.chapter), [briefsQuery.data]);
  const nextBriefChapter = briefs.find(b => !drafted.has(b.chapter))?.chapter;
  const lastChapter = Math.max(0, ...drafts.map(d => d.chapter), ...briefs.map(b => b.chapter));
  const nextManualChapter = lastChapter + 1;
  const hasContradiction = drafts.some(d => d.reviewStatus === 'contradiction');
  const planApproved = statusQuery.data?.planApproved ?? false;

  // Generation gates mirror the backend (PLN_001 / DRF_003); surface the reason rather than let the call throw.
  const generateReason = !nextBriefChapter ? 'No brief to generate from — write it yourself' : !planApproved ? 'Approve the volume plan first' : hasContradiction ? 'Resolve the flagged contradiction first' : undefined;
  const canGenerate = !generateReason;

  const createManual = useUpdateDraftMutation(novelId, nextManualChapter);

  const startGeneration = (): void => {
    generate.mutate({ limit: 1 }, { onSuccess: job => onProgress(job.jobId), onError: e => toast.danger(e.message) });
  };

  const startBatch = (): void => {
    generate.mutate({ limit: 5 }, { onSuccess: job => onProgress(job.jobId), onError: e => toast.danger(e.message) });
  };

  // "Write manually" seeds a blank human-authored draft (generator='human' on the backend) and drops
  // straight into the editor.
  const writeManually = (): void => {
    createManual.mutate({ body: '' }, { onSuccess: () => onOpen(nextManualChapter), onError: e => toast.danger(e.message) });
  };

  const deleteDraft = useDeleteDraftMutation(novelId);
  const [deleteTarget, setDeleteTarget] = useState<DraftResponse | undefined>();
  const doDelete = (): void => {
    if (!deleteTarget) return;
    deleteDraft.mutate(deleteTarget.chapter, {
      onSuccess: () => {
        toast.success(`Chapter ${deleteTarget.chapter} deleted`);
        setDeleteTarget(undefined);
      },
      onError: e => toast.danger(e.message),
    });
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
      <div style={{ maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', padding: '44px 32px 90px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 5px', fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>Chapters</h1>
            <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>
              {drafts.length} drafts · {totalWords.toLocaleString()} words
            </p>
          </div>
          <div style={{ display: 'flex' }}>
            <Button
              variant="primary"
              loading={generate.isPending || createManual.isPending}
              prefix={<PlusIcon />}
              onClick={canGenerate ? startGeneration : writeManually}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              {canGenerate ? `Generate ch ${nextBriefChapter}` : 'Write chapter'}
            </Button>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button variant="primary" aria-label="Chapter creation options" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, paddingInline: 8, boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.25)' }}>
                  <ChevronDownIcon size={14} />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item disabled={!canGenerate} onSelect={startGeneration}>
                  Generate ch {nextBriefChapter ?? nextManualChapter} from its brief
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={writeManually}>Write ch {nextManualChapter} yourself</DropdownMenu.Item>
                {!canGenerate && generateReason && (
                  <div style={{ padding: '4px 10px 6px', fontSize: 11, color: 'var(--sh-text-tertiary)', maxWidth: 240 }}>{generateReason}</div>
                )}
                <DropdownMenu.Separator />
                <DropdownMenu.Label>Advanced</DropdownMenu.Label>
                <DropdownMenu.Item disabled={!canGenerate} onSelect={startBatch}>
                  Draft the next 5 chapters (no review)
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
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
                <div
                  key={draft.id}
                  role="button"
                  tabIndex={0}
                  className="nf-selrow"
                  onClick={() => onOpen(draft.chapter)}
                  onKeyDown={e => e.key === 'Enter' && onOpen(draft.chapter)}
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
                  <StatusChip intent={draft.generator === 'human' ? 'neutral' : 'accent'}>{draft.generator === 'human' ? 'You' : 'AI'}</StatusChip>
                  <span style={{ fontSize: 12, color: 'var(--sh-text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 80, textAlign: 'right' }}>
                    {wordCount(draft.body).toLocaleString()} words
                  </span>
                  <span style={{ width: 118, flexShrink: 0, display: 'flex', justifyContent: 'flex-start' }}>
                    <StatusChip intent={meta.intent} dot>
                      {meta.label}
                    </StatusChip>
                  </span>
                  <div className="nf-rowactions">
                    <RowAction label={`Delete chapter ${draft.chapter}`} danger onClick={() => setDeleteTarget(draft)}>
                      <TrashIcon size={14} />
                    </RowAction>
                  </div>
                  <ChevronRightIcon size={16} style={{ color: 'var(--sh-text-placeholder)', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        </QueryState>
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={o => !o && setDeleteTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title={`Delete chapter ${deleteTarget?.chapter}?`}
            description={`“${deleteTarget?.title ?? 'Untitled chapter'}” and its revision history will be permanently removed. This cannot be undone.`}
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteDraft.isPending} onClick={doDelete}>
              Delete chapter
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
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
 * The Markdown formatting toolbar: the small set of marks a novelist actually reaches for — bold,
 * italic, bulleted / numbered lists, and tables. Each acts on the write-tab textarea's selection.
 */
interface ProseToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onBulleted: () => void;
  onNumbered: () => void;
  onTable: () => void;
}

interface ToolbarButton {
  label: React.ReactNode;
  title: string;
  action: () => void;
}

function ProseToolbar({ onBold, onItalic, onBulleted, onNumbered, onTable }: ProseToolbarProps): React.JSX.Element {
  const buttons: ToolbarButton[] = [
    { label: <strong>B</strong>, title: 'Bold (⌘B)', action: onBold },
    { label: <em>I</em>, title: 'Italic (⌘I)', action: onItalic },
    { label: '•', title: 'Bulleted list', action: onBulleted },
    { label: '1.', title: 'Numbered list', action: onNumbered },
    { label: '▦', title: 'Table', action: onTable },
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
      <span style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>Markdown supported</span>
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
  const judge = useJudgeDraftMutation(novelId, chapter);
  const extract = useExtractToBibleMutation(novelId, chapter);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [text, setText] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const draft = draftQuery.data;

  // Seed the Markdown buffer whenever the chapter changes. A chapter with no prose yet (a fresh "write
  // it yourself" draft) opens straight in the Write tab; one that already has prose opens as a read.
  useEffect(() => {
    setText(draft?.body ?? '');
    setTab('write');
    setEditing(draft ? !(draft.body ?? '').trim() : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  useEffect(() => {
    if (editing && tab === 'write') editorRef.current?.focus();
  }, [editing, tab]);

  if (draftQuery.isLoading) return <PaneLoader />;
  if (draftQuery.error) return <PaneError error={draftQuery.error} />;
  if (!draft) return <PaneLoader />;

  const meta = statusMeta(draft);
  const canApprove = draft.reviewStatus !== 'contradiction' && draft.reviewStatus !== 'generating' && draft.status !== 'final';

  const enterEdit = (): void => {
    setText(draft.body ?? '');
    setTab('write');
    setEditing(true);
  };

  // ─── Markdown toolbar actions — operate on the Write textarea's current selection ────────────────
  const surround = (before: string, after: string): void => {
    const el = editorRef.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const next = text.slice(0, s) + before + text.slice(s, e) + after + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  };

  const prefixLines = (prefix: (i: number) => string): void => {
    const el = editorRef.current;
    if (!el) return;
    const from = text.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const nl = text.indexOf('\n', el.selectionEnd);
    const to = nl === -1 ? text.length : nl;
    const out = text
      .slice(from, to)
      .split('\n')
      .map((line, i) => prefix(i) + line)
      .join('\n');
    const next = text.slice(0, from) + out + text.slice(to);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from, from + out.length);
    });
  };

  const insertTable = (): void => {
    const el = editorRef.current;
    if (!el) return;
    const at = el.selectionStart;
    const tpl = '\n| Column A | Column B |\n| --- | --- |\n| Cell 1 | Cell 2 |\n| Cell 3 | Cell 4 |\n';
    setText(text.slice(0, at) + tpl + text.slice(at));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at + tpl.length, at + tpl.length);
    });
  };

  const onEditorKeyDown = (e: React.KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') surround('**', '**');
    else if (key === 'i') surround('*', '*');
    else return;
    e.preventDefault();
  };

  const save = (): void => {
    updateDraft.mutate(
      { body: sanitizeSource(text), title: draft.title ?? undefined },
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

  // The manual "Verify" pass: run the continuity judge against the bible on demand.
  const runJudge = (): void => {
    judge.mutate(undefined, {
      onSuccess: r => (r.verdict === 'contradiction' ? toast.danger('Judge flagged a contradiction — open review for details') : toast.success('Judge verdict: consistent')),
      onError: err => toast.danger(err.message),
    });
  };

  // Fold the canon this chapter establishes back into the bible as a reviewable proposal.
  const runExtract = (): void => {
    extract.mutate(undefined, {
      onSuccess: () => toast.success('Canon proposal drafted — review it on the Proposals page'),
      onError: err => toast.danger(err.message),
    });
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
              <IconButton variant="ghost" aria-label="Edit prose" icon={<EditIcon size={17} />} onClick={enterEdit} />
            </Tooltip>
            <Tooltip content="Add this chapter's new canon to the bible as a proposal">
              <Button variant="ghost" size="sm" loading={extract.isPending} disabled={!draft.body?.trim()} onClick={runExtract}>
                Add to bible
              </Button>
            </Tooltip>
            <Button variant="secondary" size="sm" loading={judge.isPending} disabled={!draft.body?.trim()} onClick={runJudge}>
              Verify
            </Button>
            <Button variant="primary" size="sm" disabled={!canApprove} loading={approveDraft.isPending} onClick={approve}>
              Approve draft
            </Button>
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {editing ? (
          <div className="nf-scroll" style={{ position: 'absolute', inset: 0 }}>
            <div style={{ maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', padding: '16px 32px 120px' }}>
              {/* Write / Preview tabs — GitHub-style */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--sh-border-subtle)' }}>
                {(['write', 'preview'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: '7px 14px',
                      border: 'none',
                      borderBottom: `2px solid ${tab === t ? 'var(--sh-accent)' : 'transparent'}`,
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 'var(--sh-text-body-sm)',
                      fontWeight: tab === t ? 700 : 500,
                      color: tab === t ? 'var(--sh-text-primary)' : 'var(--sh-text-tertiary)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === 'write' ? (
                <>
                  <ProseToolbar
                    onBold={() => surround('**', '**')}
                    onItalic={() => surround('*', '*')}
                    onBulleted={() => prefixLines(() => '- ')}
                    onNumbered={() => prefixLines(i => `${i + 1}. `)}
                    onTable={insertTable}
                  />
                  <textarea
                    ref={editorRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={onEditorKeyDown}
                    spellCheck
                    aria-label="Chapter prose (Markdown)"
                    placeholder="Write your chapter in Markdown…"
                    style={{
                      display: 'block',
                      width: '100%',
                      minHeight: '62vh',
                      resize: 'vertical',
                      outline: 'none',
                      border: '1px solid var(--sh-border-subtle)',
                      borderRadius: 'var(--sh-radius-md)',
                      background: 'var(--sh-surface-app)',
                      padding: '14px 16px',
                      fontSize: 15,
                      lineHeight: 1.7,
                      fontFamily: 'var(--sh-font-mono)',
                      color: 'var(--sh-text-primary)',
                      caretColor: 'var(--sh-accent)',
                    }}
                  />
                </>
              ) : (
                <div
                  className="nf-md"
                  style={{ minHeight: '62vh', fontSize: 19, lineHeight: 1.85, fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif" }}
                  dangerouslySetInnerHTML={renderMarkdown(text)}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="nf-scroll" style={{ position: 'absolute', inset: 0 }}>
            <article style={{ maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', padding: '64px 32px 120px', fontSize: 19, lineHeight: 1.85, fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif" }}>
              {draft.title && (
                <div style={{ fontFamily: 'var(--sh-font-sans)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--sh-text-tertiary)', marginBottom: 26 }}>Chapter {chapter}</div>
              )}
              {draft.body?.trim() ? (
                <div className="nf-md" dangerouslySetInnerHTML={renderMarkdown(draft.body)} />
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
