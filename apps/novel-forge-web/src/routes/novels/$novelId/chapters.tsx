import { type ContentRating, normalizeContentRating } from '@shadow-library/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  Checkbox,
  Dialog,
  Drawer,
  DropdownMenu,
  FormField,
  IconButton,
  Input,
  SegmentedControl,
  Spinner,
  Textarea,
  toast,
  Tooltip,
} from '@shadow-library/ui';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, PlusIcon, SparkIcon, TrashIcon, UploadIcon, WarningIcon } from '@/components/icons';
import { type ChipIntent, ContentRatingPicker, Markdown, PaneError, PaneLoader, QueryState, RowAction, StatusChip } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { ImageGallery } from '@/components/nf/ImageGallery';
import {
  type AmendChapterResponse,
  type DraftResponse,
  externalStopChapter,
  type InsertChapterBody,
  isFinalizeBlocked,
  isIsolated,
  listBriefsQueryOptions,
  listDraftsQueryOptions,
  projectStatusQueryOptions,
  useAddChapterImageMutation,
  useAmendChapterMutation,
  useApproveDraftMutation,
  useChapterImagesQuery,
  useDeleteChapterImageMutation,
  useDeleteDraftMutation,
  useDraftQuery,
  useExtractToBibleMutation,
  useGenerateMutation,
  useGenerateUnrestrictedMutation,
  useImportDraftMutation,
  useInsertChapterMutation,
  useJudgeDraftMutation,
  useListBriefsQuery,
  useListDraftsQuery,
  useListJobsQuery,
  useListRunsQuery,
  useProjectStatusQuery,
  useSummarizeChapterMutation,
  useUpdateDraftMutation,
} from '@/lib/apis';

import styles from './chapters.module.css';

function toneOf(intent: ChipIntent): 'success' | 'danger' | 'warning' {
  return intent === 'success' ? 'success' : intent === 'danger' ? 'danger' : 'warning';
}

interface ChaptersSearch {
  chapter?: number;
  job?: string;
  /** The external-write slot that truncated the last batch — the read models carry no write-mode flag, so the URL is what remembers it. */
  slot?: number;
}

// Which chapter editor / generation-progress view is open lives in the URL, so a refresh returns to
// the same chapter instead of the list.
export const Route = createFileRoute('/novels/$novelId/chapters')({
  validateSearch: (search: Record<string, unknown>): ChaptersSearch => {
    const chapter = Number(search.chapter);
    const slot = Number(search.slot);
    return {
      chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : undefined,
      job: typeof search.job === 'string' && search.job ? search.job : undefined,
      slot: Number.isInteger(slot) && slot > 0 ? slot : undefined,
    };
  },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(listDraftsQueryOptions(params.novelId)),
      context.queryClient.prefetchQuery(listBriefsQueryOptions(params.novelId)),
      context.queryClient.prefetchQuery(projectStatusQueryOptions(params.novelId)),
    ]);
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

function UnrestrictedBadge(): React.JSX.Element {
  return (
    <Tooltip content="Firewalled: this chapter's prose is never indexed, retrieved, or fed to continuity extraction. Downstream chapters see only its summary and continuation state.">
      <span>
        <StatusChip intent="warning">unrestricted</StatusChip>
      </span>
    </Tooltip>
  );
}

interface InsertChapterDialogProps {
  novelId: string;
  afterChapter: number;
  downstream: number[];
  onOpenChange: (open: boolean) => void;
}

// The consequences are spelled out before the call, not after: the insert is one transaction that
// renumbers every downstream chapter, and there is no undo to review afterwards.
function InsertChapterDialog({ novelId, afterChapter, downstream, onOpenChange }: InsertChapterDialogProps): React.JSX.Element {
  const insert = useInsertChapterMutation(novelId);
  const [origin, setOrigin] = useState<'hand' | 'planner'>('hand');
  const [briefBody, setBriefBody] = useState('');
  const [intent, setIntent] = useState('');
  const newChapter = afterChapter + 1;
  const shifted = downstream.filter(n => n > afterChapter).sort((a, b) => a - b);
  const invalid = origin === 'hand' ? !briefBody.trim() : !intent.trim();

  const submit = (): void => {
    const body: InsertChapterBody = origin === 'hand' ? { briefOrigin: 'hand', briefBody: briefBody.trim() } : { briefOrigin: 'planner', intent: intent.trim() };
    insert.mutate(
      { afterChapter, body },
      {
        onSuccess: result => {
          toast.success(`Chapter ${result.newChapter} inserted — ${result.shiftedChapters} renumbered`);
          onOpenChange(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="lg">
        <Dialog.Header
          title={`Insert chapter ${newChapter}`}
          description={afterChapter === 0 ? 'The new chapter goes ahead of chapter 1.' : `The new chapter goes immediately after chapter ${afterChapter}.`}
        />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <div className={styles.consequences}>
              <div className={styles.consequencesTitle}>What this changes</div>
              <ul className={styles.consequencesList}>
                <li>
                  {shifted.length === 0
                    ? 'Nothing downstream to renumber — the new chapter lands at the end of the plan.'
                    : `Chapters ${shifted[0]}–${shifted[shifted.length - 1]} move up by one: ${shifted.length} briefs are renumbered and re-rendered.`}
                </li>
                <li>The arc and volume around this point each grow by one chapter; later arcs and volumes shift. This happens silently — the plan is not re-approved.</li>
                <li>Every draft after the insert point is marked stale.</li>
                <li>Finalized chapters never move, so the insert is refused below the write frontier.</li>
              </ul>
            </div>
            <FormField label="Where the brief comes from">
              <SegmentedControl value={origin} onValueChange={value => setOrigin(value as 'hand' | 'planner')}>
                <SegmentedControl.Item value="hand">Write the brief</SegmentedControl.Item>
                <SegmentedControl.Item value="planner">Plan it from an intent</SegmentedControl.Item>
              </SegmentedControl>
            </FormField>
            {origin === 'hand' ? (
              <FormField label="Brief" required helper="Stored verbatim as the new chapter's brief.">
                <Textarea
                  value={briefBody}
                  onValueChange={setBriefBody}
                  minRows={6}
                  autoGrow
                  autoFocus
                  placeholder="What happens in this chapter, who is present, what changes by the end…"
                />
              </FormField>
            ) : (
              <FormField label="Intent" required helper="One line. The planner drafts the brief from it plus the surrounding chapters and the arc objective.">
                <Input value={intent} onValueChange={setIntent} autoFocus placeholder="Kael finally tells Amara what happened in the vault." />
              </FormField>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" disabled={invalid} loading={insert.isPending} onClick={submit}>
            Insert chapter {newChapter}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

type FillMode = 'generate' | 'paste';

interface FillSlotDialogProps {
  novelId: string;
  chapter: number;
  onOpenChange: (open: boolean) => void;
  onFilled: (chapter: number) => void;
}

function FillSlotDialog({ novelId, chapter, onOpenChange, onFilled }: FillSlotDialogProps): React.JSX.Element {
  const generate = useGenerateUnrestrictedMutation(novelId, chapter);
  const importDraft = useImportDraftMutation(novelId, chapter);
  const [mode, setMode] = useState<FillMode>('generate');
  const [guidance, setGuidance] = useState('');
  const [prose, setProse] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [isolated, setIsolated] = useState(true);
  const [rating, setRating] = useState<ContentRating>({});

  const done = (): void => {
    onFilled(chapter);
    onOpenChange(false);
  };

  const submit = (): void => {
    const contentRating = normalizeContentRating(rating);
    if (mode === 'generate') {
      generate.mutate({ guidance: guidance.trim() || undefined, contentRating }, { onSuccess: done, onError: error => toast.danger(error.message) });
      return;
    }
    importDraft.mutate(
      { prose: sanitizeSource(prose), title: title.trim() || undefined, summary: summary.trim() || undefined, isolated, contentRating },
      { onSuccess: done, onError: error => toast.danger(error.message) },
    );
  };

  const pending = generate.isPending || importDraft.isPending;
  const invalid = mode === 'generate' ? false : !prose.trim();

  return (
    <Dialog open onOpenChange={open => !pending && onOpenChange(open)}>
      <Dialog.Content size="lg">
        <Dialog.Header
          title={`Fill chapter ${chapter}`}
          description="This slot is written outside the primary model — either generated by the unrestricted writer or pasted in by you."
        />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <SegmentedControl value={mode} onValueChange={value => setMode(value as FillMode)}>
              <SegmentedControl.Item value="generate">Generate unrestricted</SegmentedControl.Item>
              <SegmentedControl.Item value="paste">Paste prose</SegmentedControl.Item>
            </SegmentedControl>
            {mode === 'generate' ? (
              <>
                <Alert intent="warning" title="Written by the permissive model">
                  The prose is firewalled: never indexed, never retrieved, never fed to continuity extraction. Chapter {chapter + 1} will see only its summary and continuation
                  state.
                </Alert>
                <FormField label="Guidance" helper="What this chapter has to put on the page. Optional — the brief is used either way.">
                  <Textarea value={guidance} onValueChange={setGuidance} minRows={4} autoGrow autoFocus />
                </FormField>
              </>
            ) : (
              <>
                <FormField label="Prose" required helper="Markdown. Replaces whatever is in the slot.">
                  <Textarea value={prose} onValueChange={setProse} minRows={8} autoGrow autoFocus />
                </FormField>
                <div className={styles.dialogGrid}>
                  <FormField label="Title">
                    <Input value={title} onValueChange={setTitle} />
                  </FormField>
                  <FormField label="Summary" helper="Required before a firewalled chapter can be finalized.">
                    <Input value={summary} onValueChange={setSummary} />
                  </FormField>
                </div>
                <Checkbox
                  checked={isolated}
                  onCheckedChange={checked => setIsolated(checked === true)}
                  label="Firewall this chapter"
                  description="Keeps the prose out of the index, retrieval, and continuity extraction. Leave it on for explicit content."
                />
              </>
            )}
            <ContentRatingPicker value={rating} onValueChange={setRating} />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" disabled={invalid} loading={pending} onClick={submit}>
            {mode === 'generate' ? 'Generate chapter' : 'Save prose'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

type Filter = 'all' | 'needs_review' | 'draft' | 'final';

interface ChapterRow {
  chapter: number;
  title?: string | null;
  draft?: DraftResponse;
}

interface ChapterListProps {
  novelId: string;
  externalSlot?: number;
  onOpen: (n: number) => void;
  onProgress: (jobId: string, externalSlot?: number) => void;
}

function ChapterList({ novelId, externalSlot, onOpen, onProgress }: ChapterListProps): React.JSX.Element {
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
  const generateReason = !nextBriefChapter
    ? 'No brief to generate from — write it yourself'
    : !planApproved
      ? 'Approve the volume plan first'
      : hasContradiction
        ? 'Resolve the flagged contradiction first'
        : undefined;
  const canGenerate = !generateReason;

  const createManual = useUpdateDraftMutation(novelId, nextManualChapter);

  // A batch truncates rather than skips at an external-write slot, so the response names the chapter
  // the author has to fill by hand before generation continues past it.
  const runGenerate = (limit: number): void => {
    generate.mutate(
      { limit },
      {
        onSuccess: job => {
          const stopped = externalStopChapter(job);
          if (stopped) toast.warning(`Batch stopped at chapter ${stopped} — it is written outside the primary model`);
          onProgress(job.jobId, stopped);
        },
        onError: e => toast.danger(e.message),
      },
    );
  };

  const startGeneration = (): void => runGenerate(1);

  const startBatch = (): void => runGenerate(5);

  const writeManually = (): void => {
    createManual.mutate({ body: '' }, { onSuccess: () => onOpen(nextManualChapter), onError: e => toast.danger(e.message) });
  };

  const deleteDraft = useDeleteDraftMutation(novelId);
  const [deleteTarget, setDeleteTarget] = useState<DraftResponse | undefined>();
  const [insertAfter, setInsertAfter] = useState<number | undefined>();
  const [fillTarget, setFillTarget] = useState<number | undefined>();
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

  // Unwritten brief slots are rows too — an external-write slot only exists as a brief until someone
  // fills it, and it has to be reachable from this list to be fillable at all.
  const rows: ChapterRow[] = [
    ...visible.map(draft => ({ chapter: draft.chapter, title: draft.title, draft })),
    ...(filter === 'all' ? briefs.filter(b => !drafted.has(b.chapter)).map(b => ({ chapter: b.chapter, title: b.title })) : []),
  ].sort((a, b) => a.chapter - b.chapter);

  // Mirrors the backend's CHP_003 gate — a finalized chapter never moves, so nothing inserts below it.
  const frontier = Math.max(0, ...drafts.filter(d => d.status === 'final').map(d => d.chapter));
  const planned = [...drafts.map(d => d.chapter), ...briefs.map(b => b.chapter)];

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
          <ButtonGroup variant="primary" aria-label="Chapter creation">
            <Button loading={generate.isPending || createManual.isPending} prefix={<PlusIcon />} onClick={canGenerate ? startGeneration : writeManually}>
              {canGenerate ? `Generate ch ${nextBriefChapter}` : 'Write chapter'}
            </Button>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button aria-label="Chapter creation options" className={styles.splitCaret}>
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
                <DropdownMenu.Item disabled={frontier > 0} onSelect={() => setInsertAfter(0)}>
                  Insert a chapter ahead of ch 1
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </ButtonGroup>
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
          isEmpty={rows.length === 0}
          emptyTitle="No chapters drafted yet"
          emptyDescription="Generate your first chapter from its brief."
          emptyAction={{ label: 'Generate first chapter', onClick: startGeneration }}
        >
          <div className={styles.listBody}>
            {rows.map(({ chapter, title, draft }) => {
              if (!draft) {
                return (
                  <div key={`slot-${chapter}`} className={`${styles.rowChapter} ${styles.rowSlot}`}>
                    <span className={styles.rowNum}>{String(chapter).padStart(2, '0')}</span>
                    <span className={styles.rowTitle}>{title ?? 'Untitled chapter'}</span>
                    {chapter === externalSlot && (
                      <Tooltip content="The primary writer skips this slot — fill it with the unrestricted writer or your own prose.">
                        <span>
                          <StatusChip intent="warning">external slot</StatusChip>
                        </span>
                      </Tooltip>
                    )}
                    <span className={styles.rowWords} />
                    <span className={styles.rowStatus}>
                      <StatusChip intent="neutral" dot>
                        Not written
                      </StatusChip>
                    </span>
                    <div className={styles.slotActions}>
                      <Button variant="secondary" size="sm" prefix={<UploadIcon size={14} />} onClick={() => setFillTarget(chapter)}>
                        Fill slot
                      </Button>
                    </div>
                    <ChevronRightIcon size={16} className={styles.iconPlaceholder} />
                  </div>
                );
              }
              const meta = statusMeta(draft);
              const blocked = isFinalizeBlocked(draft);
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
                  {isIsolated(draft) && <UnrestrictedBadge />}
                  {blocked && (
                    <Tooltip content="Finalize is refused until this chapter has a summary and continuation state.">
                      <span>
                        <StatusChip intent="danger">needs summary</StatusChip>
                      </span>
                    </Tooltip>
                  )}
                  <StatusChip intent={draft.generator === 'human' ? 'neutral' : 'accent'}>{draft.generator === 'human' ? 'You' : 'AI'}</StatusChip>
                  <span className={styles.rowWords}>{wordCount(draft.body).toLocaleString()} words</span>
                  <span className={styles.rowStatus}>
                    <StatusChip intent={meta.intent} dot>
                      {meta.label}
                    </StatusChip>
                  </span>
                  <div className="nf-rowactions">
                    {draft.chapter >= frontier && (
                      <RowAction label={`Insert a chapter after ${draft.chapter}`} onClick={() => setInsertAfter(draft.chapter)}>
                        <PlusIcon size={14} />
                      </RowAction>
                    )}
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

      {insertAfter !== undefined && (
        <InsertChapterDialog novelId={novelId} afterChapter={insertAfter} downstream={planned} onOpenChange={open => !open && setInsertAfter(undefined)} />
      )}

      {fillTarget !== undefined && <FillSlotDialog novelId={novelId} chapter={fillTarget} onOpenChange={open => !open && setFillTarget(undefined)} onFilled={onOpen} />}

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

interface SummarizeDialogProps {
  novelId: string;
  chapter: number;
  body: string;
  onOpenChange: (open: boolean) => void;
}

// The endpoint deliberately persists nothing — the author reads what the permissive model produced,
// edits it, and only then saves it as the value the finalize gate checks.
function SummarizeDialog({ novelId, chapter, body, onOpenChange }: SummarizeDialogProps): React.JSX.Element {
  const summarize = useSummarizeChapterMutation(novelId, chapter);
  const updateDraft = useUpdateDraftMutation(novelId, chapter);
  const [summary, setSummary] = useState('');
  const [stateText, setStateText] = useState('{}');
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    summarize.mutate(undefined, {
      onSuccess: result => {
        setSummary(result.summary);
        setStateText(JSON.stringify(result.state, null, 2));
      },
      onError: error => toast.danger(error.message),
    });
  }, [summarize]);

  const parsedState = useMemo(() => {
    try {
      const value: unknown = JSON.parse(stateText);
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }, [stateText]);

  const save = (): void => {
    updateDraft.mutate(
      { body, summary: summary.trim(), state: parsedState },
      {
        onSuccess: () => {
          toast.success('Summary and continuation state saved');
          onOpenChange(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={open => !updateDraft.isPending && onOpenChange(open)}>
      <Dialog.Content size="lg">
        <Dialog.Header title={`Summarize chapter ${chapter}`} description="Nothing is saved until you apply it — review both fields first." />
        <Dialog.Body>
          {summarize.isPending ? (
            <div className={styles.summarizeWaiting}>
              <Spinner size="sm" />
              <span>Reading the chapter…</span>
            </div>
          ) : (
            <div className={styles.dialogForm}>
              <FormField label="Summary" required helper="2–3 sentences, past tense. This is all the next chapter gets to see of this one.">
                <Textarea value={summary} onValueChange={setSummary} minRows={4} autoGrow />
              </FormField>
              <FormField
                label="Continuation state"
                required
                error={parsedState ? undefined : 'Must be a JSON object'}
                helper="What the next chapter builds on — positions, injuries, who knows what."
              >
                <Textarea value={stateText} onValueChange={setStateText} minRows={8} autoGrow className={styles.jsonField} />
              </FormField>
            </div>
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" disabled={!summary.trim() || !parsedState} loading={updateDraft.isPending} onClick={save}>
            Apply to draft
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface AmendDialogProps {
  novelId: string;
  chapter: number;
  draft: DraftResponse;
  onOpenChange: (open: boolean) => void;
  onAmended: (result: AmendChapterResponse) => void;
}

// Amend is the only writer allowed past the immutability lock. It replaces prose and nothing else —
// the bible keeps whatever this chapter already put there, hence the re-derive follow-up afterwards.
function AmendDialog({ novelId, chapter, draft, onOpenChange, onAmended }: AmendDialogProps): React.JSX.Element {
  const amend = useAmendChapterMutation(novelId, chapter);
  const [content, setContent] = useState(draft.body ?? '');
  const [title, setTitle] = useState(draft.title ?? '');
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<ContentRating>({});

  const submit = (): void => {
    amend.mutate(
      { content: sanitizeSource(content), title: title.trim() || undefined, note: note.trim() || undefined, contentRating: normalizeContentRating(rating) },
      {
        onSuccess: result => {
          toast.success(`Chapter ${chapter} amended — ${result.wordCount.toLocaleString()} words${result.republished ? ', republish scheduled' : ''}`);
          onAmended(result);
          onOpenChange(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={open => !amend.isPending && onOpenChange(open)}>
      <Dialog.Content size="lg">
        <Dialog.Header title={`Amend chapter ${chapter}`} description="Rewrites finalized canon in place. The chapter stays locked and keeps its number." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <Alert intent="warning" title="Prose only">
              The bible, continuity, and every downstream chapter are untouched. Anything this chapter already contributed to canon keeps propagating until you re-derive it.
            </Alert>
            <FormField label="Prose" required>
              <Textarea value={content} onValueChange={setContent} minRows={10} autoGrow />
            </FormField>
            <div className={styles.dialogGrid}>
              <FormField label="Title">
                <Input value={title} onValueChange={setTitle} />
              </FormField>
              <FormField label="Author's note" helper="Reaches the reader — changing it republishes the chapter.">
                <Input value={note} onValueChange={setNote} />
              </FormField>
            </div>
            <ContentRatingPicker value={rating} onValueChange={setRating} />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="danger" disabled={!content.trim()} loading={amend.isPending} onClick={submit}>
            Amend chapter {chapter}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
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
  const navigate = useNavigate();
  const sceneImagesQuery = useChapterImagesQuery(novelId, chapter);
  const addSceneImage = useAddChapterImageMutation(novelId, chapter);
  const removeSceneImage = useDeleteChapterImageMutation(novelId, chapter);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendResult, setAmendResult] = useState<AmendChapterResponse | undefined>();
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
  const finalizeBlocked = isFinalizeBlocked(draft);

  const enterEdit = (): void => {
    setText(draft.body ?? '');
    setTab('write');
    setEditing(true);
  };

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

  const runJudge = (): void => {
    judge.mutate(undefined, {
      onSuccess: r => (r.verdict === 'contradiction' ? toast.danger('Judge flagged a contradiction — open review for details') : toast.success('Judge verdict: consistent')),
      onError: err => toast.danger(err.message),
    });
  };

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
        {isIsolated(draft) && <UnrestrictedBadge />}
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
            {draft.status === 'final' ? (
              <Tooltip content="Rewrite this finalized chapter's prose in place — the only path past the immutability lock">
                <Button variant="secondary" size="sm" onClick={() => setAmendOpen(true)}>
                  Amend
                </Button>
              </Tooltip>
            ) : (
              <Button variant="primary" size="sm" disabled={!canApprove} loading={approveDraft.isPending} onClick={approve}>
                Approve draft
              </Button>
            )}
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
              {finalizeBlocked && (
                <Alert
                  intent="danger"
                  title="Finalize is blocked until this chapter is summarized"
                  action={{ label: 'Summarize', onClick: () => setSummarizeOpen(true) }}
                  className={styles.notice}
                >
                  This chapter’s prose is firewalled, so chapter {chapter + 1} sees only its summary and continuation state — and both are empty. Summarizing proposes them; you
                  review and apply before anything is saved.
                </Alert>
              )}
              {amendResult?.suggestExtractToBible && (
                <Alert
                  intent="warning"
                  title="Canon was not re-derived"
                  action={{ label: 'Add to bible', onClick: runExtract }}
                  onDismiss={() => setAmendResult(undefined)}
                  className={styles.notice}
                >
                  The amendment replaced prose only. Anything this chapter already contributed to the bible is still there and still propagating.
                </Alert>
              )}
              {draft.title && <div className={styles.chapterEyebrow}>Chapter {chapter}</div>}
              {draft.body?.trim() ? (
                <Markdown content={draft.body} />
              ) : (
                <p className={styles.emptyProse}>This chapter has no prose yet. Use “Edit prose” to write it, or generate a draft from its brief.</p>
              )}

              <section className={styles.sceneImages}>
                <div className={styles.sceneImagesHead}>
                  Scene images
                  <Button
                    variant="secondary"
                    size="sm"
                    prefix={<SparkIcon />}
                    onClick={() => navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { subject: 'chapter', key: String(chapter), start: true } })}
                  >
                    Generate scene art
                  </Button>
                </div>
                <ImageGallery
                  images={(sceneImagesQuery.data?.items ?? []).map(img => ({ id: img.id, url: img.imageUrl, caption: img.caption }))}
                  busy={addSceneImage.isPending || removeSceneImage.isPending}
                  addLabel="Add scene image"
                  onAdd={body => addSceneImage.mutate(body, { onSuccess: () => toast.success('Scene image added'), onError: e => toast.danger(e.message) })}
                  onRemove={id => removeSceneImage.mutate(id, { onSuccess: () => toast.success('Scene image removed'), onError: e => toast.danger(e.message) })}
                />
              </section>
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

      {summarizeOpen && <SummarizeDialog novelId={novelId} chapter={chapter} body={draft.body ?? ''} onOpenChange={setSummarizeOpen} />}

      {amendOpen && <AmendDialog novelId={novelId} chapter={chapter} draft={draft} onOpenChange={setAmendOpen} onAmended={setAmendResult} />}

      <ReviewDrawer open={reviewOpen} onOpenChange={setReviewOpen} draft={draft} />
      <ChapterSwitchDrawer open={chaptersOpen} onOpenChange={setChaptersOpen} novelId={novelId} current={chapter} onPick={onPick} />
    </div>
  );
}

function ChaptersScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { chapter, job, slot } = Route.useSearch();
  const navigate = Route.useNavigate();

  const openChapter = (n?: number): Promise<void> => navigate({ search: { chapter: n, slot } });
  const openJob = (jobId?: string, externalSlot?: number): Promise<void> => navigate({ search: { job: jobId, slot: externalSlot ?? slot } });

  if (job) return <GenerationProgress novelId={novelId} jobId={job} onBack={() => openJob(undefined)} />;
  return chapter != null ? (
    <ChapterEditor novelId={novelId} chapter={chapter} onBack={() => openChapter(undefined)} onPick={openChapter} />
  ) : (
    <ChapterList novelId={novelId} externalSlot={slot} onOpen={openChapter} onProgress={openJob} />
  );
}
