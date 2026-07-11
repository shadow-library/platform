/**
 * Importing npm packages
 */
import { Button, Dialog, Drawer, DropdownMenu, IconButton, SegmentedControl, Spinner, Tooltip, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, PlusIcon, TrashIcon, WarningIcon } from '@/components/icons';
import { Markdown, PaneError, PaneLoader, QueryState, RowAction, StatusChip, type ChipIntent } from '@/components/nf';
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

import styles from './chapters.module.css';

// Maps a status chip intent to the three-way tone used by the verdict banner and status pill.
function toneOf(intent: ChipIntent): 'success' | 'danger' | 'warning' {
  return intent === 'success' ? 'success' : intent === 'danger' ? 'danger' : 'warning';
}

interface ChaptersSearch {
  chapter?: number;
  job?: string;
}

// Which chapter editor / generation-progress view is open lives in the URL, so a refresh returns to
// the same chapter instead of the list.
export const Route = createFileRoute('/novels/$novelId/chapters')({
  validateSearch: (search: Record<string, unknown>): ChaptersSearch => {
    const chapter = Number(search.chapter);
    return {
      chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : undefined,
      job: typeof search.job === 'string' && search.job ? search.job : undefined,
    };
  },
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
// reading view and the editor's Preview tab render it through the shared <Markdown> component.

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
    <div className={`nf-scroll ${styles.progressScreen}`}>
      <div className={styles.progressInner}>
        <div className={styles.progressHead}>
          {!finished ? <Spinner size="md" /> : null}
          <h1 className={styles.progressTitle}>{finished ? (job?.status === 'done' ? 'Generation complete' : 'Generation failed') : 'Generating…'}</h1>
        </div>
        <p className={styles.progressSub}>
          {chapters.length > 0 ? `Chapter${chapters.length > 1 ? 's' : ''} ${job?.target}` : 'Preparing the next chapter'} · drafted in order, judged, then queued for your review.
        </p>

        <div className={styles.jobCard}>
          <div className={styles.jobHead}>
            <span className={styles.jobLabel}>Job {jobId.slice(0, 8)}</span>
            <StatusChip intent={job?.status === 'done' ? 'success' : job?.status === 'failed' ? 'danger' : 'info'} dot>
              {job?.status ?? 'pending'}
            </StatusChip>
            <div className={styles.spacer} />
            <span className={styles.jobTarget}>target: {job?.target ?? '…'}</span>
          </div>
          {job?.lastError && <pre className={styles.jobError}>{job.lastError}</pre>}
        </div>

        <div className={styles.runList}>
          {runs.length === 0 && !finished && <div className={styles.runWaiting}>Waiting for the first workflow run to start…</div>}
          {runs.map(run => (
            <div key={run.id} className={styles.runCard}>
              {run.status === 'running' ? <Spinner size="sm" /> : null}
              <span className={styles.runLabel}>
                {run.graph} · {run.target}
              </span>
              <div className={styles.spacer} />
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
    <div className={`nf-scroll ${styles.screenScroll}`}>
      <div className={`nf-page ${styles.listInner}`}>
        <div className={styles.listHead}>
          <div className={styles.listHeadMain}>
            <h1 className={styles.title}>Chapters</h1>
            <p className={styles.subtitle}>
              {drafts.length} drafts · {totalWords.toLocaleString()} words
            </p>
          </div>
          <div className={styles.splitBtn}>
            <Button variant="primary" loading={generate.isPending || createManual.isPending} prefix={<PlusIcon />} onClick={canGenerate ? startGeneration : writeManually} className={styles.splitLeft}>
              {canGenerate ? `Generate ch ${nextBriefChapter}` : 'Write chapter'}
            </Button>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button variant="primary" aria-label="Chapter creation options" className={styles.splitRight}>
                  <ChevronDownIcon size={14} />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item disabled={!canGenerate} onSelect={startGeneration}>
                  Generate ch {nextBriefChapter ?? nextManualChapter} from its brief
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={writeManually}>Write ch {nextManualChapter} yourself</DropdownMenu.Item>
                {!canGenerate && generateReason && <div className={styles.menuNote}>{generateReason}</div>}
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
          <button onClick={() => onProgress(activeJob.id)} className={styles.activeJobBtn}>
            <Spinner size="sm" />
            <span className={styles.activeJobLabel}>Generating chapter {activeJob.target} — view progress</span>
          </button>
        )}

        <div className={styles.filterWrap}>
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
          <div className={styles.listBody}>
            {visible.map(draft => {
              const meta = statusMeta(draft);
              return (
                <div
                  key={draft.id}
                  role="button"
                  tabIndex={0}
                  className={`nf-selrow ${styles.rowChapter}`}
                  onClick={() => onOpen(draft.chapter)}
                  onKeyDown={e => e.key === 'Enter' && onOpen(draft.chapter)}
                >
                  <span className={styles.rowNum}>{String(draft.chapter).padStart(2, '0')}</span>
                  <span className={styles.rowTitle}>{draft.title ?? 'Untitled chapter'}</span>
                  <StatusChip intent={draft.generator === 'human' ? 'neutral' : 'accent'}>{draft.generator === 'human' ? 'You' : 'AI'}</StatusChip>
                  <span className={styles.rowWords}>{wordCount(draft.body).toLocaleString()} words</span>
                  <span className={styles.rowStatus}>
                    <StatusChip intent={meta.intent} dot>
                      {meta.label}
                    </StatusChip>
                  </span>
                  <div className="nf-rowactions">
                    <RowAction label={`Delete chapter ${draft.chapter}`} danger onClick={() => setDeleteTarget(draft)}>
                      <TrashIcon size={14} />
                    </RowAction>
                  </div>
                  <ChevronRightIcon size={16} className={styles.iconPlaceholder} />
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
  const tone = clean ? 'success' : draft.reviewStatus === 'contradiction' ? 'danger' : 'warning';
  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="right" size="sm">
      <Drawer.Header title="Judge review" meta={draft.judge ?? undefined} />
      <Drawer.Body>
        <div className={styles.verdict} data-tone={tone}>
          <WarningIcon size={17} className={styles.verdictIcon} />
          <div>
            <div className={styles.verdictLabel}>{meta.label}</div>
            <div className={styles.verdictSub}>{clean ? 'Re-validated against the bible' : 'Judge flagged this draft'}</div>
          </div>
        </div>
        {draft.judgeNote ? (
          <p className={styles.judgeNote}>{draft.judgeNote}</p>
        ) : (
          <p className={`${styles.judgeNote} ${styles.judgeNoteEmpty}`}>No judge notes recorded for this draft.</p>
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
              data-active={active || undefined}
              onClick={() => {
                onPick(d.chapter);
                onOpenChange(false);
              }}
            >
              <span className={styles.switchNum}>{String(d.chapter).padStart(2, '0')}</span>
              <span className={styles.switchTitle}>{d.title ?? 'Untitled'}</span>
              {(d.reviewStatus === 'needs_review' || d.reviewStatus === 'contradiction') && (
                <span className={styles.switchDot} style={{ '--nf-dot': meta.intent === 'danger' ? 'var(--sh-danger-solid)' : 'var(--sh-warning-solid)' } as React.CSSProperties} />
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
    <div className={styles.toolbar}>
      {buttons.map((b, i) => (
        <Tooltip key={i} content={b.title}>
          <button onMouseDown={e => e.preventDefault()} onClick={b.action} aria-label={b.title} className={styles.toolbarBtn}>
            {b.label}
          </button>
        </Tooltip>
      ))}
      <div className={styles.spacer} />
      <span className={styles.toolbarNote}>Markdown supported</span>
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
    <div className={styles.editorScreen}>
      <div className={styles.editorHead}>
        <Tooltip content="Back to chapters">
          <IconButton variant="ghost" aria-label="Back to chapters" icon={<ChevronLeftIcon size={18} />} onClick={onBack} />
        </Tooltip>
        <button className={`nf-nav ${styles.chapterNav}`} onClick={() => setChaptersOpen(true)}>
          <span className={styles.chapterNavNum}>{String(chapter).padStart(2, '0')}</span>
          <span className={styles.chapterNavTitle}>{draft.title ?? 'Untitled chapter'}</span>
          <ChevronRightIcon size={15} className={styles.iconTertiary} />
        </button>
        <div className={styles.spacer} />
        <button onClick={() => setReviewOpen(true)} className={styles.statusPill} data-tone={toneOf(meta.intent)}>
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

      <div className={styles.body}>
        {editing ? (
          <div className={`nf-scroll ${styles.scrollFill}`}>
            <div className={`nf-page ${styles.editorInner}`}>
              {/* Write / Preview tabs — GitHub-style */}
              <div className={styles.tabs}>
                {(['write', 'preview'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={styles.tab} data-active={tab === t}>
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
                    className={styles.textarea}
                  />
                </>
              ) : (
                <Markdown content={text} className={styles.preview} />
              )}
            </div>
          </div>
        ) : (
          <div className={`nf-scroll ${styles.scrollFill}`}>
            <article className={`nf-page ${styles.reader}`}>
              {draft.title && <div className={styles.chapterEyebrow}>Chapter {chapter}</div>}
              {draft.body?.trim() ? (
                <Markdown content={draft.body} />
              ) : (
                <p className={styles.emptyProse}>This chapter has no prose yet. Use “Edit prose” to write it, or generate a draft from its brief.</p>
              )}
            </article>
          </div>
        )}

        {!editing && <div className={styles.wordBadge}>{wordCount(draft.body).toLocaleString()} words</div>}

        {!editing && (
          <div className={styles.forgeDock}>
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
  const { chapter, job } = Route.useSearch();
  const navigate = Route.useNavigate();

  // Chapter and job are mutually exclusive views; setting one clears the other.
  const openChapter = (n?: number): Promise<void> => navigate({ search: { chapter: n } });
  const openJob = (jobId?: string): Promise<void> => navigate({ search: { job: jobId } });

  if (job) return <GenerationProgress novelId={novelId} jobId={job} onBack={() => openJob(undefined)} />;
  return chapter != null ? (
    <ChapterEditor novelId={novelId} chapter={chapter} onBack={() => openChapter(undefined)} onPick={openChapter} />
  ) : (
    <ChapterList novelId={novelId} onOpen={openChapter} onProgress={openJob} />
  );
}
