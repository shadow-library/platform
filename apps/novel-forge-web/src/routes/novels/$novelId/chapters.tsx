import { type ContentRating, normalizeContentRating } from '@shadow-library/sdk';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Drawer,
  DropdownMenu,
  FormField,
  IconButton,
  Input,
  Pagination,
  SegmentedControl,
  Spinner,
  Textarea,
  toast,
  Tooltip,
} from '@shadow-library/ui';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, PlusIcon, SparkIcon, TrashIcon, UploadIcon, WarningIcon } from '@/components/icons';
import { type ChipIntent, ContentRatingPicker, GenerationStatus, Markdown, PaneError, PaneLoader, QueryState, RowAction, StatusChip, StopButton } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { ImageGallery } from '@/components/nf/ImageGallery';
import { BriefSections } from '@/features/briefs';
import {
  type AmendChapterResponse,
  type ChapterRowResponse,
  chapterRowsQueryOptions,
  type DraftResponse,
  externalStopChapter,
  type InsertChapterBody,
  isFinalizeBlocked,
  isIsolated,
  type ListChapterRowsQueryParams,
  projectStatusQueryOptions,
  useAddChapterImageMutation,
  useAmendChapterMutation,
  useApproveDraftMutation,
  useBriefQuery,
  useChapterImagesQuery,
  useChapterRowsQuery,
  useDeleteChapterImageMutation,
  useDeleteDraftMutation,
  useDraftQuery,
  useDraftSummaryQuery,
  useExtractToBibleMutation,
  useGenerateMutation,
  useGenerateUnrestrictedMutation,
  useImportDraftMutation,
  useInsertChapterMutation,
  useJudgeDraftMutation,
  useProjectStatusQuery,
  useRegenerateChapterMutation,
  useReviseDraftMutation,
  useSummarizeChapterMutation,
  useUpdateDraftMutation,
} from '@/lib/apis';
import { CHAPTER_PAGE_SIZE, type ChapterCounts, type ChapterFilter, chapterSummary, isChapterFilter, pageOfChapter } from '@/lib/chapter-list';
import { chapterGeneration, type ChapterGeneration } from '@/lib/generation-activity';
import { buildRepairNote } from '@/lib/review-queue';
import { useGenerationActivity } from '@/lib/use-generation-activity';

import styles from './chapters.module.css';

function toneOf(intent: ChipIntent): 'success' | 'danger' | 'warning' {
  return intent === 'success' ? 'success' : intent === 'danger' ? 'danger' : 'warning';
}

interface ChaptersSearch {
  chapter?: number;
  page?: number;
  filter?: ChapterFilter;
  /** A hand-off from elsewhere (e.g. Overview's Next step card) — opens straight into the review drawer instead of the read view. */
  review?: boolean;
}

// The open chapter, list page and filter live in the URL, so a refresh or Back returns to the same place.
export const Route = createFileRoute('/novels/$novelId/chapters')({
  validateSearch: (search: Record<string, unknown>): ChaptersSearch => {
    const chapter = Number(search.chapter);
    const page = Number(search.page);
    return {
      chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
      filter: isChapterFilter(search.filter) && search.filter !== 'all' ? search.filter : undefined,
      review: search.review === true || search.review === 'true' ? true : undefined,
    };
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, filter: search.filter ?? 'all' }),
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(chapterRowsQueryOptions(params.novelId, chapterRowsParams(deps.page, deps.filter))),
      context.queryClient.prefetchQuery(projectStatusQueryOptions(params.novelId)),
    ]);
  },
  component: ChaptersScreen,
});

function chapterRowsParams(page: number, filter: ChapterFilter): ListChapterRowsQueryParams {
  return { filter, limit: CHAPTER_PAGE_SIZE, offset: (page - 1) * CHAPTER_PAGE_SIZE };
}

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

function statusMeta(draft: Pick<DraftResponse, 'status' | 'reviewStatus'>): StatusMeta {
  if (draft.status === 'final') return { intent: 'success', label: 'Final' };
  return STATUS_META[draft.reviewStatus] ?? { intent: 'neutral', label: 'Draft' };
}

// reviseDraft has no judge loop of its own — it rewrites from a feedback note, so the note carries the
// judge's own findings back in as the instruction to fix.
function wordCount(body?: string | null): number {
  if (!body) return 0;
  return body.trim().split(/\s+/).filter(Boolean).length;
}

// Defense in depth: strip dangerous HTML from the Markdown source before it is persisted, so the stored
// manuscript stays clean regardless of where the prose came from.
function sanitizeSource(md: string): string {
  return DOMPurify.sanitize(md);
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
                  description="Keeps the prose out of the index, retrieval, and continuity extraction."
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

const FILTERS: readonly { value: ChapterFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_written', label: 'Not written' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'draft', label: 'Drafts' },
  { value: 'final', label: 'Final' },
];

function formatChapterNumber(chapter: number): string {
  return String(chapter).padStart(2, '0');
}

const EMPTY_COUNTS: ChapterCounts = { all: 0, not_written: 0, needs_review: 0, draft: 0, final: 0 };

function activateOnKey(activate: () => void): (event: React.KeyboardEvent<HTMLElement>) => void {
  return event => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    activate();
  };
}

interface BriefDrawerProps {
  novelId: string;
  chapter: number;
  generation?: ChapterGeneration;
  generateLabel?: string;
  onOpenChange: (open: boolean) => void;
  onGenerate?: () => void;
  generating: boolean;
}

function BriefDrawer({ novelId, chapter, generation, generateLabel, onOpenChange, onGenerate, generating }: BriefDrawerProps): React.JSX.Element {
  const navigate = useNavigate();
  const briefQuery = useBriefQuery(novelId, chapter);
  const brief = briefQuery.data;
  const openFullBrief = (): Promise<void> => navigate({ to: '/novels/$novelId/volumes', params: { novelId }, search: { volume: brief?.volumeKey ?? undefined, chapter } });

  return (
    <Drawer open onOpenChange={onOpenChange} placement="right" size="md">
      <Drawer.Header title={brief?.title ?? `Chapter ${chapter}`} meta={`Chapter ${chapter} · Brief`} />
      <Drawer.Body>
        {generation && (
          <div className={styles.drawerStatus}>
            <GenerationStatus generation={generation} />
          </div>
        )}
        {briefQuery.isLoading ? (
          <PaneLoader />
        ) : briefQuery.error ? (
          <PaneError error={briefQuery.error} />
        ) : brief ? (
          <>
            {brief.staleReason && (
              <Alert intent="warning" title="This brief is stale" className={styles.notice}>
                {brief.staleReason} — refresh the outline before generating from it.
              </Alert>
            )}
            <BriefSections brief={brief} />
          </>
        ) : null}
      </Drawer.Body>
      <Drawer.Footer>
        <Button variant="ghost" onClick={openFullBrief}>
          Open full brief →
        </Button>
        {onGenerate && (
          <Button variant="primary" prefix={<SparkIcon />} loading={generating} onClick={onGenerate}>
            {generateLabel}
          </Button>
        )}
      </Drawer.Footer>
    </Drawer>
  );
}

interface ChapterListProps {
  novelId: string;
  page: number;
  filter: ChapterFilter;
  onOpen: (n: number) => void;
  onBrowse: (page: number, filter: ChapterFilter, replace?: boolean) => void;
}

function ChapterList({ novelId, page, filter, onOpen, onBrowse }: ChapterListProps): React.JSX.Element {
  const rowsQuery = useChapterRowsQuery(novelId, chapterRowsParams(page, filter));
  const statusQuery = useProjectStatusQuery(novelId);
  const generate = useGenerateMutation(novelId);
  const { activity, stop, stopping } = useGenerationActivity(novelId);
  const data = rowsQuery.data;
  const rows = data?.items ?? [];
  const counts = data?.counts ?? EMPTY_COUNTS;
  const chapters = data?.chapters ?? [];
  const nextBriefChapter = data?.nextBriefChapter ?? undefined;
  const nextManualChapter = (data?.lastChapter ?? 0) + 1;
  const contradiction = data?.contradiction ?? undefined;
  const frontier = data?.frontier ?? 0;
  const planApproved = statusQuery.data?.planApproved ?? false;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / CHAPTER_PAGE_SIZE));

  // Judge + repair costs more per draft, so it stays a per-run choice — on by default per product decision.
  const [autoFix, setAutoFix] = useState(true);
  const [briefChapter, setBriefChapter] = useState<number | undefined>();

  // Generation gates mirror the backend (PLN_001 / DRF_003); surface the reason rather than let the call throw.
  const generateReason = !nextBriefChapter
    ? 'No brief to generate from — write it yourself'
    : !planApproved
      ? 'Approve the volume plan first'
      : contradiction
        ? `Resolve chapter ${contradiction.chapter}’s flagged contradiction first`
        : undefined;
  const canGenerate = !generateReason && !activity;

  const createManual = useUpdateDraftMutation(novelId, nextManualChapter);

  // A page past the end (the last row on it was deleted, or a stale link) snaps back to the last real page.
  const overshot = Boolean(data && page > pageCount);
  useEffect(() => {
    if (overshot) onBrowse(pageCount, filter, true);
  }, [overshot, pageCount, filter, onBrowse]);

  const reveal = (chapter: number): void => {
    if (rows.some(row => row.chapter === chapter)) return;
    onBrowse(pageOfChapter(chapters, chapter), 'all');
  };

  // A batch truncates rather than skips at an external-write slot; the brief's own `writeMode` marks
  // that slot in the row list regardless, but the toast still gives immediate feedback on *this* run.
  const runGenerate = (limit: number): void => {
    const target = nextBriefChapter;
    generate.mutate(
      { limit, autoFix },
      {
        onSuccess: job => {
          const stopped = externalStopChapter(job);
          if (stopped) toast.warning(`Batch stopped at chapter ${stopped} — it is written outside the primary model`);
          setBriefChapter(undefined);
          if (target) reveal(target);
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
  const [deleteTarget, setDeleteTarget] = useState<ChapterRowResponse | undefined>();
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

  const offscreen = activity && !rows.some(row => row.chapter === activity.current) ? activity : undefined;
  const offscreenGeneration = offscreen && chapterGeneration(offscreen, offscreen.current);
  const briefIsNext = briefChapter !== undefined && briefChapter === nextBriefChapter;

  return (
    <div className={`nf-scroll ${styles.screenScroll}`}>
      <div className={`nf-page ${styles.listInner}`}>
        <div className={styles.listHead}>
          <div className={styles.listHeadMain}>
            <h1 className={styles.title}>Chapters</h1>
            <p className={styles.subtitle}>{chapterSummary(counts, data?.totalWords ?? 0)}</p>
          </div>
          <ButtonGroup variant="primary" aria-label="Chapter creation">
            <Button loading={generate.isPending || createManual.isPending || Boolean(activity)} prefix={<PlusIcon />} onClick={canGenerate ? startGeneration : writeManually}>
              {activity ? `Writing ch ${activity.current}` : canGenerate ? `Generate ch ${nextBriefChapter}` : 'Write chapter'}
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
                {!canGenerate && (activity || generateReason) && (
                  <div className={styles.menuNote}>{activity ? `Chapter ${activity.current} is being written — stop it or wait for it to finish` : generateReason}</div>
                )}
                <DropdownMenu.Separator />
                <DropdownMenu.Label>Advanced</DropdownMenu.Label>
                <DropdownMenu.CheckboxItem checked={autoFix} onCheckedChange={checked => setAutoFix(checked === true)}>
                  Auto-fix contradictions
                </DropdownMenu.CheckboxItem>
                <div className={styles.menuNote}>Judge + repair reviews every draft and rewrites it when flagged — costs more per chapter.</div>
                <DropdownMenu.Item disabled={!canGenerate} onSelect={startBatch}>
                  Draft the next 5 chapters
                </DropdownMenu.Item>
                <DropdownMenu.Item disabled={frontier > 0} onSelect={() => setInsertAfter(0)}>
                  Insert a chapter ahead of ch 1
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </ButtonGroup>
        </div>

        {offscreen && offscreenGeneration && (
          <button onClick={() => reveal(offscreen.current)} className={styles.activeJobBtn}>
            <GenerationStatus generation={offscreenGeneration} label={`Writing chapter ${offscreen.current}`} />
            <span className={styles.activeJobLabel}>Show it in the list</span>
          </button>
        )}

        {contradiction && (
          <Alert
            intent="danger"
            title={
              contradiction.count > 1
                ? `Chapter ${contradiction.chapter} was flagged by the judge (${contradiction.count} chapters need attention)`
                : `Chapter ${contradiction.chapter} was flagged by the judge`
            }
            action={{ label: `Review chapter ${contradiction.chapter}`, onClick: () => onOpen(contradiction.chapter) }}
            className={styles.notice}
          >
            {contradiction.judgeNote?.trim() || 'The judge found a continuity issue. Open the chapter to repair or regenerate it.'} Further generation is blocked until it’s
            resolved.
          </Alert>
        )}

        <div className={styles.filterWrap}>
          <SegmentedControl value={filter} onValueChange={v => onBrowse(1, v as ChapterFilter)}>
            {FILTERS.map(({ value, label }) => (
              <SegmentedControl.Item key={value} value={value}>
                {label} <span className={styles.filterCount}>{counts[value]}</span>
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        </div>

        <QueryState
          isLoading={rowsQuery.isLoading}
          error={rowsQuery.error}
          isEmpty={rows.length === 0 && !overshot}
          emptyTitle={filter === 'all' ? 'No chapters yet' : `No chapters match “${FILTERS.find(f => f.value === filter)?.label}”`}
          emptyDescription={filter === 'all' ? (canGenerate ? 'Generate your first chapter from its brief.' : generateReason) : 'Pick another filter to see the rest of the list.'}
          emptyAction={
            filter === 'all'
              ? { label: canGenerate ? 'Generate first chapter' : 'Write chapter 1', onClick: canGenerate ? startGeneration : writeManually }
              : { label: 'Show all chapters', onClick: () => onBrowse(1, 'all') }
          }
        >
          <>
            <ul className={styles.listBody} aria-label="Chapters" aria-busy={rowsQuery.isPlaceholderData || undefined}>
              {rows.map(row => {
                const generation = chapterGeneration(activity, row.chapter);
                const writing = generation?.phase === 'writing';
                const stopAction = writing && <StopButton onStop={stop} stopping={stopping} />;

                if (row.kind === 'planned') {
                  const openBrief = (): void => setBriefChapter(row.chapter);
                  return (
                    <li key={`slot-${row.chapter}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`View the brief for chapter ${row.chapter}: ${row.title ?? 'Untitled chapter'}`}
                        className={`nf-selrow ${styles.row} ${styles.rowPlanned}`}
                        onClick={openBrief}
                        onKeyDown={activateOnKey(openBrief)}
                      >
                        <span className={styles.rowNum}>{formatChapterNumber(row.chapter)}</span>
                        <span className={styles.rowMain}>
                          <span className={`${styles.rowTitle} ${row.title ? '' : styles.rowTitleUntitled}`}>{row.title ?? 'Untitled chapter'}</span>
                          {row.writeMode === 'external' && (
                            <Tooltip content="The primary writer skips this slot — fill it with the unrestricted writer or your own prose.">
                              <span className={styles.badge}>
                                <StatusChip intent="warning">external slot</StatusChip>
                              </span>
                            </Tooltip>
                          )}
                        </span>
                        <span className={styles.rowMeta}>
                          <span className={styles.rowOrigin} />
                          <span className={styles.rowWords} />
                          <span className={styles.rowStatus}>
                            {generation ? (
                              <GenerationStatus generation={generation} />
                            ) : (
                              <span className={styles.plannedChip}>
                                <span className={styles.plannedDot} />
                                Not written
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={styles.rowActions}>
                          {stopAction ||
                            (!generation && (
                              <Button
                                variant="ghost"
                                size="sm"
                                prefix={<UploadIcon size={14} />}
                                onClick={event => {
                                  event.stopPropagation();
                                  setFillTarget(row.chapter);
                                }}
                                aria-label={`Fill slot for chapter ${row.chapter}`}
                              >
                                Fill slot
                              </Button>
                            ))}
                        </span>
                        <ChevronRightIcon size={16} className={styles.rowChevron} />
                      </div>
                    </li>
                  );
                }

                const meta = statusMeta({ status: row.status ?? 'draft', reviewStatus: row.reviewStatus ?? 'generating' });
                const words = row.wordCount ?? 0;
                const open = (): void => onOpen(row.chapter);
                return (
                  <li key={`draft-${row.chapter}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Open chapter ${row.chapter}: ${row.title ?? 'Untitled chapter'}`}
                      className={`nf-selrow ${styles.row} ${styles.rowWritten}`}
                      onClick={open}
                      onKeyDown={activateOnKey(open)}
                    >
                      <span className={styles.rowNum}>{formatChapterNumber(row.chapter)}</span>
                      <span className={styles.rowMain}>
                        <span className={`${styles.rowTitle} ${row.title ? '' : styles.rowTitleUntitled}`}>{row.title ?? 'Untitled chapter'}</span>
                        {row.isolated && (
                          <span className={styles.badge}>
                            <UnrestrictedBadge />
                          </span>
                        )}
                        {row.finalizeBlocked && (
                          <Tooltip content="Finalize is refused until this chapter has a summary and continuation state.">
                            <span className={styles.badge}>
                              <StatusChip intent="danger">needs summary</StatusChip>
                            </span>
                          </Tooltip>
                        )}
                      </span>
                      <span className={styles.rowMeta}>
                        <span className={styles.rowOrigin}>
                          <StatusChip intent={row.generator === 'human' ? 'neutral' : 'accent'}>{row.generator === 'human' ? 'You' : 'AI'}</StatusChip>
                        </span>
                        <span className={styles.rowWords}>{words === 0 ? 'Empty' : `${words.toLocaleString()} words`}</span>
                        <span className={styles.rowStatus}>
                          {generation ? (
                            <GenerationStatus generation={generation} label="Rewriting" />
                          ) : (
                            <StatusChip intent={meta.intent} dot>
                              {meta.label}
                            </StatusChip>
                          )}
                        </span>
                      </span>
                      <span className={`${writing ? '' : 'nf-rowactions'} ${styles.rowActions}`}>
                        {stopAction || (
                          <>
                            {row.chapter >= frontier && (
                              <RowAction label={`Insert a chapter after ${row.chapter}`} onClick={() => setInsertAfter(row.chapter)}>
                                <PlusIcon size={14} />
                              </RowAction>
                            )}
                            <RowAction label={`Delete chapter ${row.chapter}`} danger onClick={() => setDeleteTarget(row)}>
                              <TrashIcon size={14} />
                            </RowAction>
                          </>
                        )}
                      </span>
                      <ChevronRightIcon size={16} className={styles.rowChevron} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {(data?.total ?? 0) > CHAPTER_PAGE_SIZE && (
              <Pagination
                className={styles.pagination}
                page={Math.min(page, pageCount)}
                total={data?.total ?? 0}
                pageSize={CHAPTER_PAGE_SIZE}
                onPageChange={next => onBrowse(next, filter)}
              />
            )}
          </>
        </QueryState>
      </div>

      {briefChapter !== undefined && (
        <BriefDrawer
          novelId={novelId}
          chapter={briefChapter}
          generation={chapterGeneration(activity, briefChapter)}
          generateLabel={`Generate chapter ${briefChapter}`}
          onGenerate={briefIsNext && canGenerate ? startGeneration : undefined}
          generating={generate.isPending}
          onOpenChange={open => !open && setBriefChapter(undefined)}
        />
      )}

      {insertAfter !== undefined && (
        <InsertChapterDialog novelId={novelId} afterChapter={insertAfter} downstream={chapters} onOpenChange={open => !open && setInsertAfter(undefined)} />
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
  novelId: string;
  draft: DraftResponse;
  onRegenerated: () => void;
}

function ReviewDrawer({ open, onOpenChange, novelId, draft, onRegenerated }: ReviewDrawerProps): React.JSX.Element {
  const meta = statusMeta(draft);
  const clean = draft.reviewStatus === 'approved' || draft.reviewStatus === 'final';
  const contradicted = draft.reviewStatus === 'contradiction';
  const tone = clean ? 'success' : contradicted ? 'danger' : 'warning';
  // A finalized draft can still land in "contradiction" from a later manual Verify, but revise/delete
  // both refuse a finalized draft (DRF_002) — Amend is the only path past that lock.
  const recoverable = contradicted && draft.status !== 'final';

  const revise = useReviseDraftMutation(novelId, draft.chapter);
  const regenerate = useRegenerateChapterMutation(novelId);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const regenerating = regenerate.isPending;

  const repair = (): void => {
    revise.mutate(
      { note: buildRepairNote(draft.judgeNote) },
      { onSuccess: () => toast.success('Repair applied — run Verify to confirm it satisfies the judge'), onError: err => toast.danger(err.message) },
    );
  };

  // The server owns every rule that decides whether this chapter can be redrafted now (order, other contradictions,
  // external chapters, a running job), so its refusal is the reason shown.
  const runRegenerate = (): void => {
    regenerate.mutate(draft.chapter, {
      onSuccess: () => {
        setConfirmRegen(false);
        toast.success(`Regenerating chapter ${draft.chapter} — its current prose stays in the revision history`);
        onRegenerated();
      },
      onError: err => {
        setConfirmRegen(false);
        toast.danger(err.message);
      },
    });
  };

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
        {recoverable && (
          <div className={styles.reviewActions}>
            <Button variant="primary" size="sm" loading={revise.isPending} disabled={regenerating} onClick={repair}>
              Repair with AI
            </Button>
            <Button variant="secondary" size="sm" loading={regenerating} disabled={revise.isPending} onClick={() => setConfirmRegen(true)}>
              Regenerate chapter
            </Button>
          </div>
        )}
        {contradicted && !recoverable && (
          <p className={`${styles.judgeNote} ${styles.judgeNoteEmpty}`}>This chapter is finalized — use Amend from the chapter view to rewrite its prose in place.</p>
        )}
      </Drawer.Body>

      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        intent="danger"
        title={`Regenerate chapter ${draft.chapter}?`}
        description="Redrafts the chapter from its brief with the judge and repairs. The current prose stays in the revision history, and later chapters are marked stale once the new draft lands."
        confirmLabel="Regenerate"
        loading={regenerating}
        onConfirm={runRegenerate}
      />
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
  const draftsQuery = useDraftSummaryQuery(novelId, open);
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
              key={d.chapter}
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
  const [rating, setRating] = useState<ContentRating>(draft.contentRating ?? {});

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
  const { activity, stop, stopping } = useGenerationActivity(novelId);
  const generation = chapterGeneration(activity, chapter);

  // A `?review=1` hand-off (e.g. from Overview's Next step card) opens straight into the drawer; this
  // is read once at mount, matching the drawer's own open state being otherwise locally controlled.
  const { review: openReviewOnLoad } = Route.useSearch();
  const [reviewOpen, setReviewOpen] = useState(openReviewOnLoad === true);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendResult, setAmendResult] = useState<AmendChapterResponse | undefined>();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [text, setText] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const draft = draftQuery.data;

  // A chapter with no prose yet (a fresh "write it yourself" draft) opens straight in the Write tab;
  // one that already has prose opens as a read.
  const [seeded, setSeeded] = useState<{ draftId?: string }>({});
  if (seeded.draftId !== draft?.id) {
    setSeeded({ draftId: draft?.id });
    setText(draft?.body ?? '');
    setTab('write');
    setEditing(draft ? !(draft.body ?? '').trim() : false);
  }

  useEffect(() => {
    if (editing && tab === 'write') editorRef.current?.focus();
  }, [editing, tab]);

  // A draft that 404s (deleted out from under this view — e.g. by "Regenerate chapter") has no route to
  // recover in place: bounce back to the list instead of stranding the author on a dead PaneError whose
  // Retry only reloads the same missing chapter.
  const draftMissing = draftQuery.error?.status === 404;
  useEffect(() => {
    if (draftMissing) onBack();
  }, [draftMissing, onBack]);

  if (draftQuery.isLoading || draftMissing) return <PaneLoader />;
  if (draftQuery.error) return <PaneError error={draftQuery.error} />;
  if (!draft) return <PaneLoader />;

  const meta = statusMeta(draft);
  const canApprove = !generation && draft.reviewStatus !== 'contradiction' && draft.reviewStatus !== 'generating' && draft.status !== 'final';
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
        {generation ? (
          <>
            <GenerationStatus generation={generation} label="Regenerating" />
            {generation.phase === 'writing' && <StopButton onStop={stop} stopping={stopping} />}
          </>
        ) : (
          <button onClick={() => setReviewOpen(true)} className={styles.statusPill} data-tone={toneOf(meta.intent)}>
            {meta.label}
          </button>
        )}
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
            <Tooltip content={generation ? 'The chapter is being regenerated — edits would be overwritten' : 'Edit prose'}>
              <IconButton variant="ghost" aria-label="Edit prose" icon={<EditIcon size={17} />} disabled={Boolean(generation)} onClick={enterEdit} />
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

      <ReviewDrawer open={reviewOpen} onOpenChange={setReviewOpen} novelId={novelId} draft={draft} onRegenerated={() => setReviewOpen(false)} />
      <ChapterSwitchDrawer open={chaptersOpen} onOpenChange={setChaptersOpen} novelId={novelId} current={chapter} onPick={onPick} />
    </div>
  );
}

function ChaptersScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { chapter, page = 1, filter = 'all' } = Route.useSearch();
  const navigate = Route.useNavigate();

  const openChapter = (n?: number): Promise<void> => navigate({ search: previous => ({ ...previous, chapter: n, review: undefined }) });
  const browse = useCallback(
    (next: number, nextFilter: ChapterFilter, replace?: boolean): Promise<void> =>
      navigate({ search: { page: next > 1 ? next : undefined, filter: nextFilter === 'all' ? undefined : nextFilter }, replace }),
    [navigate],
  );

  return chapter != null ? (
    <ChapterEditor novelId={novelId} chapter={chapter} onBack={() => openChapter(undefined)} onPick={openChapter} />
  ) : (
    <ChapterList novelId={novelId} page={page} filter={filter} onOpen={openChapter} onBrowse={browse} />
  );
}
