import { createFileRoute } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Drawer,
  FormField,
  Input,
  Kbd,
  Pagination,
  SegmentedControl,
  Select,
  Spinner,
  Textarea,
  toast,
  Tooltip,
} from '@shadow-library/ui';

import { DownloadIcon, PlusIcon, WarningIcon } from '@/components/icons';
import { PageHeader, PaneError, PaneLoader, QueryState, StatusChip } from '@/components/nf';
import {
  type ApiError,
  type ChapterTranslationStatus,
  fetchTranslationManuscript,
  type TranslationChapterDetailResponse,
  type TranslationChapterListParams,
  type TranslationChapterSummaryResponse,
  type TranslationGlossaryCategory,
  translationJob,
  translationJobActive,
  type TranslationStatusResponse,
  type TranslationTermDecision,
  type TranslationTermResponse,
  type TranslationTreatment,
  useApproveTranslationTermMutation,
  useCreateTranslationTermMutation,
  useDeleteOriginalMutation,
  useEditTranslationMutation,
  useFinalizeTranslationChapterMutation,
  useLastOriginalChapterQuery,
  useRejectTranslationTermMutation,
  useReopenTranslationChapterMutation,
  useRerunTranslationChapterMutation,
  useStartTranslationMutation,
  useTranslationChapterQuery,
  useTranslationChaptersQuery,
  useTranslationGlossaryQuery,
  useTranslationOriginalQuery,
  useTranslationStatusQuery,
  useTranslationTermDecisionsMutation,
  useUpdateTranslationConfigMutation,
  useUpdateTranslationTermMutation,
  useUpsertOriginalMutation,
} from '@/lib/apis';
import { languageName, relativeTime } from '@/lib/format';
import {
  alignParagraphs,
  CHAPTER_STATE_INTENT,
  CHAPTER_STATE_LABEL,
  chapterAttentionNote,
  chapterRowState,
  chapterStaleNote,
  finalizeBlockers,
  finalizeTooltip,
  GLOSSARY_CATEGORIES,
  pasteStatsLabel,
  startActionLabel,
  TRANSLATION_PHASE_LABEL,
  TREATMENT_INTENT,
  TREATMENT_LABEL,
  TREATMENTS,
} from '@/lib/translation';

import styles from './translation.module.css';

const CHAPTER_PAGE_SIZE = 25;
const GLOSSARY_PAGE_SIZE = 25;
const QUEUE_LIMIT = 200;

type TranslationTab = 'chapters' | 'terminology';
type TerminologyView = 'queue' | 'glossary' | 'rejected';
type ChapterFilter = 'all' | ChapterTranslationStatus | 'stale';

const CHAPTER_FILTERS: ChapterFilter[] = ['all', 'translated', 'attention', 'finalized', 'failed', 'stale'];

interface TranslationSearch {
  tab: TranslationTab;
  view: TerminologyView;
  filter: ChapterFilter;
  chapter?: number;
  page: number;
}

/** The reader's rail lists the same page the table does, so both build their query from here. */
function chapterListParams(page: number, filter: ChapterFilter): TranslationChapterListParams {
  return { page, limit: CHAPTER_PAGE_SIZE, status: filter === 'all' || filter === 'stale' ? undefined : filter, stale: filter === 'stale' ? true : undefined };
}

// Tab, terminology pane, open chapter and page all live in the URL so a refresh returns to the same
// place instead of the chapter list's first page.
export const Route = createFileRoute('/novels/$novelId/translation')({
  validateSearch: (search: Record<string, unknown>): TranslationSearch => {
    const chapter = Number(search.chapter);
    const page = Number(search.page);
    return {
      tab: search.tab === 'terminology' ? 'terminology' : 'chapters',
      view: search.view === 'glossary' ? 'glossary' : search.view === 'rejected' ? 'rejected' : 'queue',
      filter: CHAPTER_FILTERS.find(candidate => candidate === search.filter) ?? 'all',
      chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : undefined,
      page: Number.isInteger(page) && page > 0 ? page : 1,
    };
  },
  component: TranslationScreen,
});

interface TranslationIssue {
  source?: string;
  type?: string;
  detail?: string;
  excerpt?: string;
  segmentIndex?: number;
}

function issuesOf(detail?: TranslationChapterDetailResponse): TranslationIssue[] {
  return (detail?.translation.issues ?? []) as TranslationIssue[];
}

function downloadManuscript(novelId: string): void {
  fetchTranslationManuscript(novelId)
    .then(({ markdown, pendingChapters }) => {
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `translation-manuscript-${novelId}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      if (pendingChapters.length > 0) toast.info(`${pendingChapters.length} chapter(s) are not finalized yet and are missing from the manuscript`);
    })
    .catch((err: ApiError) => toast.danger(err.message));
}

interface ProgressCardProps {
  novelId: string;
  status: TranslationStatusResponse;
  onOpenQueue: () => void;
}

function ProgressCard({ novelId, status, onOpenQueue }: ProgressCardProps): React.JSX.Element {
  const job = translationJob(status);
  const active = translationJobActive(status);
  const progress = job?.progress ?? null;
  const pct = progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null;
  const { counts, glossary } = status;
  const phase = status.translation.phase;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Progress</h3>
        <StatusChip intent={phase === 'done' ? 'success' : phase === 'failed' ? 'danger' : active ? 'info' : 'neutral'}>
          {active && <Spinner size="sm" />}
          {TRANSLATION_PHASE_LABEL[phase]}
        </StatusChip>
      </div>

      {progress && (progress.total ?? 0) > 0 && (
        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>
            <span>{progress.current == null ? (progress.phase ?? 'Working') : `Chapter ${progress.current} of ${progress.total}`}</span>
            {pct !== null && <span className={styles.progressPct}>{pct}%</span>}
          </span>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
      )}

      <div className={styles.chips}>
        <StatusChip intent="success">{counts.finalized} finalized</StatusChip>
        <StatusChip intent="info">{counts.translated} translated</StatusChip>
        <StatusChip intent="warning">{counts.attention} needs review</StatusChip>
        {active && progress?.current != null && <StatusChip intent="accent">chapter {progress.current} in progress</StatusChip>}
        <StatusChip intent="neutral">{counts.untranslated} untranslated</StatusChip>
        <StatusChip intent="neutral">{counts.stale} stale</StatusChip>
        {counts.failed > 0 && <StatusChip intent="danger">{counts.failed} failed</StatusChip>}
      </div>

      <div className={styles.chips}>
        <StatusChip intent="accent">{glossary.approved} approved terms</StatusChip>
        <StatusChip intent="warning" dot>
          {glossary.suggested} suggestions to review
        </StatusChip>
        {glossary.suggested > 0 && (
          <Button variant="text" size="sm" onClick={onOpenQueue}>
            Open review queue
          </Button>
        )}
      </div>

      {status.translation.lastError && <p className={styles.error}>{status.translation.lastError}</p>}
      {job?.lastError && !status.translation.lastError && <p className={styles.error}>{job.lastError}</p>}

      <p className={styles.pushHint}>
        Pushing from another app? Send originals to{' '}
        <span className={styles.mono}>
          PUT /api/v1/ingest/projects/{novelId}/originals/{'{chapter}'}
        </span>{' '}
        with an API key issued from <span className={styles.mono}>POST /api/v1/api-keys</span>.
      </p>
    </div>
  );
}

interface SetupCardProps {
  novelId: string;
  status?: TranslationStatusResponse;
}

function SetupCard({ novelId, status }: SetupCardProps): React.JSX.Element {
  const update = useUpdateTranslationConfigMutation(novelId);
  const [styleNotes, setStyleNotes] = useState('');
  const [audit, setAudit] = useState(true);
  const [pauseAfterSeed, setPauseAfterSeed] = useState(true);
  const [honorifics, setHonorifics] = useState<'keep' | 'translate'>('keep');
  const [segmentTokens, setSegmentTokens] = useState('1800');
  const [hydrated, setHydrated] = useState(false);

  if (!hydrated && status) {
    const settings = status.translation.settings ?? {};
    setHydrated(true);
    setStyleNotes(status.translation.styleNotes ?? '');
    setAudit(settings.auditEnabled !== false);
    setPauseAfterSeed(settings.pauseAfterSeed !== false);
    setHonorifics(settings.honorifics === 'translate' ? 'translate' : 'keep');
    setSegmentTokens(String(settings.segmentTokens ?? 1800));
  }

  const save = (): void => {
    const tokens = Number(segmentTokens);
    update.mutate(
      {
        styleNotes: styleNotes.trim() || null,
        settings: { auditEnabled: audit, pauseAfterSeed, honorifics, segmentTokens: Number.isFinite(tokens) && tokens >= 200 ? tokens : undefined },
      },
      { onSuccess: () => toast.success('Setup saved'), onError: err => toast.danger(err.message) },
    );
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Setup</h3>
      <FormField label="Style notes" helper="Written by the seed pass from the opening chapters; edit freely. Sent with every chapter.">
        <Textarea value={styleNotes} onValueChange={setStyleNotes} minRows={4} placeholder="Narrative voice, name order, honorific policy, system-window formatting…" />
      </FormField>
      <div className={styles.settingsGrid}>
        <Checkbox
          checked={audit}
          onCheckedChange={value => setAudit(Boolean(value))}
          label="Fidelity audit per chapter"
          description="One extra model call; catches omissions and softened lines"
        />
        <Checkbox
          checked={pauseAfterSeed}
          onCheckedChange={value => setPauseAfterSeed(Boolean(value))}
          label="Pause after seeding"
          description="Review the first term suggestions before any chapter is translated"
        />
      </div>
      <div className={styles.settingsGrid}>
        <FormField label="Honorifics">
          <Select value={honorifics} onValueChange={value => setHonorifics(value as 'keep' | 'translate')} aria-label="Honorifics">
            <Select.Item value="keep">Keep as written (shixiong)</Select.Item>
            <Select.Item value="translate">Translate (Senior Brother)</Select.Item>
          </Select>
        </FormField>
        <FormField label="Segment size" helper="Tokens of original prose per translated segment.">
          <Input type="number" min={200} value={segmentTokens} onValueChange={setSegmentTokens} suffix="tokens" />
        </FormField>
      </div>
      <div className={styles.cardActions}>
        <Button variant="secondary" size="sm" loading={update.isPending} onClick={save}>
          Save setup
        </Button>
      </div>
    </div>
  );
}

interface OriginalDialogProps {
  novelId: string;
  open: boolean;
  chapter: number;
  mode: 'add' | 'edit';
  language?: string | null;
  onOpenChange: (open: boolean) => void;
}

function OriginalDialog({ novelId, open, chapter, mode, language, onOpenChange }: OriginalDialogProps): React.JSX.Element {
  const upsert = useUpsertOriginalMutation(novelId);
  const existing = useTranslationOriginalQuery(novelId, mode === 'edit' ? chapter : null, open);
  const [number, setNumber] = useState(String(chapter));
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hydrated, setHydrated] = useState(false);

  if (!hydrated && (mode === 'add' || existing.data)) {
    setHydrated(true);
    setNumber(String(chapter));
    setTitle(existing.data?.title ?? '');
    setContent(existing.data?.content ?? '');
  }

  const submit = (again: boolean): void => {
    const target = Number(number);
    upsert.mutate(
      { chapter: target, title: title.trim(), content },
      {
        onSuccess: ({ outcome }) => {
          toast.success(outcome === 'unchanged' ? `Chapter ${target} was already identical` : `Chapter ${target} ${outcome}`);
          if (!again) return onOpenChange(false);
          setNumber(String(target + 1));
          setTitle('');
          setContent('');
        },
        onError: err => {
          if (!err.fields?.length) toast.danger(err.message);
        },
      },
    );
  };

  const contentError = upsert.error?.fieldErrors.content;
  const scriptHint = language ? `Must be written in ${languageName(language)} — a paste in the wrong script is rejected.` : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="lg">
        <Dialog.Header
          title={mode === 'edit' ? `Edit original chapter ${chapter}` : 'Add chapter'}
          description={`Paste the chapter as written in ${languageName(language) ?? 'the original language'}. It is stored as the original and never changed by translation.`}
        />
        <Dialog.Body>
          <div className={styles.pasteRow}>
            <FormField label="Chapter" helper={mode === 'add' ? `Next after ${chapter - 1}` : undefined}>
              <Input value={number} onValueChange={setNumber} disabled={mode === 'edit'} inputMode="numeric" />
            </FormField>
            <FormField label="Original title" required error={upsert.error?.fieldErrors.title}>
              <Input value={title} onValueChange={setTitle} />
            </FormField>
          </div>
          <FormField label="Original text" required error={contentError} helper={scriptHint}>
            <Textarea value={content} onValueChange={setContent} minRows={12} maxRows={20} />
          </FormField>
          <div className={styles.pasteMeta}>
            <span>{pasteStatsLabel(content)}</span>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          {mode === 'add' && (
            <Button variant="secondary" loading={upsert.isPending} disabled={!title.trim() || !content.trim()} onClick={() => submit(true)}>
              Add and add another
            </Button>
          )}
          <Button variant="primary" loading={upsert.isPending} disabled={!title.trim() || !content.trim()} onClick={() => submit(false)}>
            {mode === 'edit' ? 'Save original' : 'Add chapter'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface ChaptersTabProps {
  novelId: string;
  status?: TranslationStatusResponse;
  page: number;
  filter: ChapterFilter;
  lastChapter: number;
  onPage: (page: number) => void;
  onFilter: (filter: ChapterFilter) => void;
  onOpenChapter: (chapter: number) => void;
  onEditOriginal: (chapter: number) => void;
  onAddChapter: () => void;
}

function ChaptersTab({ novelId, status, page, filter, lastChapter, onPage, onFilter, onOpenChapter, onEditOriginal, onAddChapter }: ChaptersTabProps): React.JSX.Element {
  const active = translationJobActive(status);
  const runningChapter = Number(translationJob(status)?.progress?.current ?? NaN);
  const [search, setSearch] = useState('');

  const params = useMemo(() => chapterListParams(page, filter), [page, filter]);
  const chaptersQuery = useTranslationChaptersQuery(novelId, params, active);
  const list = chaptersQuery.data;
  const needle = search.trim().toLowerCase();
  const rows = (list?.items ?? []).filter(item => !needle || `${item.originalTitle ?? ''} ${item.title ?? ''}`.toLowerCase().includes(needle));

  const finalize = useFinalizeTranslationChapterMutation(novelId);
  const reopen = useReopenTranslationChapterMutation(novelId);
  const rerun = useRerunTranslationChapterMutation(novelId);
  const remove = useDeleteOriginalMutation(novelId);
  const [confirm, setConfirm] = useState<{ action: 'finalize' | 'reopen' | 'delete'; chapter: number } | null>(null);

  const runConfirm = (): void => {
    if (!confirm) return;
    const { action, chapter } = confirm;
    const settled = (message: string) => (): void => {
      setConfirm(null);
      toast.success(message);
    };
    // A refusal carries the server's own reason — not the last chapter (TRN_010), or finalized/published (TRN_004).
    const onError = (err: ApiError): void => {
      toast.danger(err.message);
    };
    if (action === 'finalize') finalize.mutate(chapter, { onSuccess: settled(`Chapter ${chapter} finalized`), onError });
    else if (action === 'reopen') reopen.mutate(chapter, { onSuccess: settled(`Chapter ${chapter} reopened`), onError });
    else remove.mutate(chapter, { onSuccess: settled(`Chapter ${chapter} deleted`), onError });
  };

  const confirmCopy: Record<'finalize' | 'reopen' | 'delete', { title: string; description: string; label: string }> = {
    finalize: {
      title: `Finalize chapter ${confirm?.chapter}?`,
      description: 'This writes the English text into the novel as that chapter and locks it. The original is kept.',
      label: 'Finalize',
    },
    reopen: {
      title: `Reopen chapter ${confirm?.chapter}?`,
      description: 'The chapter goes back to translated so it can be re-run or edited. Its published text stays live until the next finalize replaces it.',
      label: 'Reopen',
    },
    delete: {
      title: `Delete original chapter ${confirm?.chapter}?`,
      description: 'The original prose is removed. Only the last chapter can be deleted, and never one whose translation is finalized or published.',
      label: 'Delete original',
    },
  };
  const copy = confirmCopy[confirm?.action ?? 'finalize'];

  const rowActions = (item: TranslationChapterSummaryResponse): React.JSX.Element => {
    const state = chapterRowState(item, item.chapter === runningChapter && active);
    const blockers = finalizeBlockers({ status: item.status, glossaryStale: item.glossaryStale, sourceStale: item.sourceStale, pendingTerms: item.pendingTerms });
    if (state === 'in_progress')
      return (
        <Button variant="text" size="sm" onClick={() => onOpenChapter(item.chapter)}>
          Read original
        </Button>
      );
    if (state === 'untranslated' || state === 'failed')
      return (
        <>
          <Button variant="text" size="sm" onClick={() => onOpenChapter(item.chapter)}>
            Read original
          </Button>
          <Button variant="text" size="sm" onClick={() => onEditOriginal(item.chapter)}>
            Edit original
          </Button>
          {item.chapter === lastChapter && (
            <Button variant="text" size="sm" onClick={() => setConfirm({ action: 'delete', chapter: item.chapter })}>
              Delete original
            </Button>
          )}
          <Button
            variant="text"
            size="sm"
            disabled={active}
            onClick={() => rerun.mutate(item.chapter, { onSuccess: () => toast.success(`Chapter ${item.chapter} queued`), onError: err => toast.danger(err.message) })}
          >
            {state === 'failed' ? 'Re-run' : 'Translate'}
          </Button>
        </>
      );
    if (state === 'finalized')
      return (
        <>
          <Button variant="text" size="sm" onClick={() => onOpenChapter(item.chapter)}>
            Read
          </Button>
          <Button variant="text" size="sm" onClick={() => setConfirm({ action: 'reopen', chapter: item.chapter })}>
            Reopen
          </Button>
        </>
      );
    return (
      <>
        <Button variant="text" size="sm" onClick={() => onOpenChapter(item.chapter)}>
          Read
        </Button>
        <Tooltip content={finalizeTooltip(blockers)}>
          <Button variant="text" size="sm" disabled={blockers.length > 0} onClick={() => setConfirm({ action: 'finalize', chapter: item.chapter })}>
            Finalize
          </Button>
        </Tooltip>
        <Button
          variant="text"
          size="sm"
          disabled={active}
          onClick={() => rerun.mutate(item.chapter, { onSuccess: () => toast.success(`Chapter ${item.chapter} queued`), onError: err => toast.danger(err.message) })}
        >
          Re-run
        </Button>
      </>
    );
  };

  const total = list?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * CHAPTER_PAGE_SIZE + 1;
  const last = Math.min(page * CHAPTER_PAGE_SIZE, total);

  return (
    <>
      <div className={styles.filterRow}>
        <div className={styles.filters}>
          <Select value={filter} onValueChange={value => onFilter(value as ChapterFilter)} size="sm" className={styles.filterSelect} aria-label="Filter by status">
            <Select.Item value="all">All statuses</Select.Item>
            <Select.Item value="translated">Translated</Select.Item>
            <Select.Item value="attention">Needs review</Select.Item>
            <Select.Item value="finalized">Finalized</Select.Item>
            <Select.Item value="failed">Failed</Select.Item>
            <Select.Item value="stale">Stale</Select.Item>
          </Select>
          <Input size="sm" className={styles.filterInput} value={search} onValueChange={setSearch} placeholder="Find a chapter on this page…" clearable />
        </div>
      </div>

      <QueryState
        isLoading={chaptersQuery.isLoading}
        error={chaptersQuery.error}
        isEmpty={total === 0}
        emptyTitle="No original chapters yet"
        emptyDescription="Paste the first chapter in its original language, or push chapters from another app with an API key."
        emptyAction={{ label: 'Add chapter', onClick: onAddChapter }}
      >
        <div className={styles.table}>
          <div className={`${styles.headerRow}`}>
            <span>#</span>
            <span>Original</span>
            <span>English</span>
            <span>Status</span>
            <span className={styles.headerActions}>Actions</span>
          </div>
          {rows.map(item => {
            const state = chapterRowState(item, item.chapter === runningChapter && active);
            const note = state === 'attention' ? chapterAttentionNote(item) : chapterStaleNote(item);
            return (
              <div key={item.chapter} className={styles.row} data-attention={state === 'attention' || undefined}>
                <span className={styles.rowNum}>{item.chapter}</span>
                <span className={`${styles.rowTitle} ${styles.rowSource}`}>{item.originalTitle ?? '—'}</span>
                <span className={item.title ? styles.rowTitle : styles.rowSub}>{item.title ?? (state === 'in_progress' ? 'Translating…' : '—')}</span>
                <span className={styles.rowStatus}>
                  <StatusChip intent={CHAPTER_STATE_INTENT[state]} dot={state !== 'untranslated'}>
                    {state === 'in_progress' && <Spinner size="sm" />}
                    {CHAPTER_STATE_LABEL[state]}
                  </StatusChip>
                  {note && <span className={styles.rowNote}>{note}</span>}
                </span>
                <span className={styles.rowActions}>{rowActions(item)}</span>
              </div>
            );
          })}
          <div className={styles.tableFoot}>
            <span>
              Chapters {first}–{last} of {total}
            </span>
            <Pagination page={page} total={total} pageSize={CHAPTER_PAGE_SIZE} onPageChange={onPage} summary={false} compact />
          </div>
        </div>
      </QueryState>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={open => !open && setConfirm(null)}
        intent={confirm?.action === 'finalize' ? 'primary' : 'danger'}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.label}
        loading={finalize.isPending || reopen.isPending || remove.isPending}
        onConfirm={runConfirm}
      />
    </>
  );
}

interface ChapterReviewProps {
  novelId: string;
  chapter: number;
  status?: TranslationStatusResponse;
  page: number;
  filter: ChapterFilter;
  onBack: () => void;
  onOpenChapter: (chapter: number, page?: number) => void;
}

interface ChapterStep {
  chapter: number;
  page: number;
}

function ChapterReview({ novelId, chapter, status, page, filter, onBack, onOpenChapter }: ChapterReviewProps): React.JSX.Element {
  const active = translationJobActive(status);
  const runningChapter = Number(translationJob(status)?.progress?.current ?? NaN);
  const listParams = useMemo(() => chapterListParams(page, filter), [page, filter]);
  const chaptersQuery = useTranslationChaptersQuery(novelId, listParams, active);
  const detailQuery = useTranslationChapterQuery(novelId, chapter);
  const untranslated = detailQuery.error?.status === 404;
  const originalQuery = useTranslationOriginalQuery(novelId, chapter, untranslated);

  const rerun = useRerunTranslationChapterMutation(novelId);
  const finalize = useFinalizeTranslationChapterMutation(novelId);
  const reopen = useReopenTranslationChapterMutation(novelId);
  const edit = useEditTranslationMutation(novelId);

  const [view, setView] = useState<'original' | 'english' | 'both'>('both');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<'finalize' | 'reopen' | null>(null);
  const [jump, setJump] = useState('');

  const [editedChapter, setEditedChapter] = useState(chapter);
  if (editedChapter !== chapter) {
    setEditedChapter(chapter);
    setEditing(false);
    setDraft('');
  }

  const detail = detailQuery.data;
  const original = detail?.original.content ?? originalQuery.data?.content ?? '';
  const originalTitle = detail?.original.title ?? originalQuery.data?.title ?? null;
  const english = detail?.translation.body ?? '';
  const items = chaptersQuery.data?.items ?? [];
  const needle = jump.trim().toLowerCase();
  const railItems = items.filter(item => !needle || String(item.chapter) === needle || `${item.originalTitle ?? ''} ${item.title ?? ''}`.toLowerCase().includes(needle));
  const index = items.findIndex(item => item.chapter === chapter);
  const total = chaptersQuery.data?.total ?? 0;

  // Off the end of the page the neighbour is on the next one, and unfiltered originals are contiguous
  // (the door refuses a gap), so chapter ± 1 names it without fetching that page first. A filtered list
  // has no such guarantee, so stepping stops at the page edge there.
  const step = (delta: 1 | -1): ChapterStep | undefined => {
    const neighbour = index >= 0 ? items[index + delta] : undefined;
    if (neighbour) return { chapter: neighbour.chapter, page };
    if (filter !== 'all') return undefined;
    if (delta === -1) return page > 1 ? { chapter: chapter - 1, page: page - 1 } : undefined;
    return page * CHAPTER_PAGE_SIZE < total ? { chapter: chapter + 1, page: page + 1 } : undefined;
  };
  const previous = step(-1);
  const next = step(1);

  const pendingTermNames = (detail?.appliedTerms ?? []).filter(term => term.status === 'suggested').map(term => term.sourceTerm);
  const blockers = finalizeBlockers({
    status: detail?.translation.status,
    glossaryStale: detail?.translation.glossaryStale ?? false,
    sourceStale: detail?.translation.sourceStale ?? false,
    pendingTerms: pendingTermNames.length,
    pendingTermNames,
  });
  const state = detail ? chapterRowState({ status: detail.translation.status }, chapter === runningChapter && active) : 'untranslated';
  const issues = issuesOf(detail);
  const pairs = view === 'both' ? alignParagraphs(original, english) : [];

  const saveEdit = (): void => {
    edit.mutate(
      { chapter, body: draft },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('English text saved');
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const runConfirm = (): void => {
    const settled = (message: string) => (): void => {
      setConfirm(null);
      toast.success(message);
    };
    const onError = (err: ApiError): void => {
      toast.danger(err.message);
    };
    if (confirm === 'finalize') finalize.mutate(chapter, { onSuccess: settled(`Chapter ${chapter} finalized`), onError });
    if (confirm === 'reopen') reopen.mutate(chapter, { onSuccess: settled(`Chapter ${chapter} reopened`), onError });
  };

  return (
    <div className={styles.splitPane}>
      <div className={styles.railPane}>
        <div className={styles.railHead}>
          <div className={styles.splitHead}>
            <span className={styles.railTitle}>Chapters</span>
            <Button variant="text" size="sm" onClick={onBack}>
              Back to list
            </Button>
          </div>
          <Input size="sm" value={jump} onValueChange={setJump} placeholder="Jump to chapter…" clearable />
        </div>
        <div className={styles.railList}>
          {chaptersQuery.isLoading && <PaneLoader />}
          {chaptersQuery.error && <PaneError error={chaptersQuery.error} />}
          {railItems.map(item => {
            const rowState = chapterRowState(item, item.chapter === runningChapter && active);
            return (
              <button key={item.chapter} className="nf-selrow" data-active={item.chapter === chapter} onClick={() => onOpenChapter(item.chapter)}>
                <span className={styles.rowNum}>{item.chapter}</span>
                <span className={`${styles.rowTitle} ${styles.railRowTitle}`}>{item.title ?? item.originalTitle ?? 'Untitled'}</span>
                <StatusChip intent={CHAPTER_STATE_INTENT[rowState]}>{CHAPTER_STATE_LABEL[rowState]}</StatusChip>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.detailPane}>
        <div className={styles.detailHead}>
          <div className={styles.detailTitleRow}>
            <div>
              <div className={styles.detailHeading}>
                <span className={styles.rowNum}>Chapter {chapter}</span>
                <h2 className={styles.detailTitle}>{detail?.translation.title ?? originalTitle ?? 'Untitled'}</h2>
                <StatusChip intent={CHAPTER_STATE_INTENT[state]} dot>
                  {CHAPTER_STATE_LABEL[state]}
                </StatusChip>
              </div>
              <p className={styles.detailMeta}>
                {originalTitle ?? '—'}
                {detail && ` · translated ${relativeTime(detail.translation.updatedAt)} · revision ${detail.translation.revision}`}
              </p>
            </div>
            <div className={styles.detailActions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={active || detail?.translation.status === 'finalized'}
                onClick={() => rerun.mutate(chapter, { onSuccess: () => toast.success(`Chapter ${chapter} queued`), onError: err => toast.danger(err.message) })}
              >
                {detail ? 'Re-run' : 'Translate'}
              </Button>
              {detail && detail.translation.status !== 'finalized' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDraft(english);
                    setEditing(true);
                    setView('english');
                  }}
                >
                  Edit English
                </Button>
              )}
              {detail?.translation.status === 'finalized' ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirm('reopen')}>
                  Reopen
                </Button>
              ) : (
                <Tooltip content={finalizeTooltip(blockers)}>
                  <Button variant="primary" size="sm" disabled={blockers.length > 0} onClick={() => setConfirm('finalize')}>
                    Finalize
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
          <div className={styles.detailControls}>
            <SegmentedControl value={view} onValueChange={value => setView(value as typeof view)} size="sm">
              <SegmentedControl.Item value="original">Original</SegmentedControl.Item>
              <SegmentedControl.Item value="english">English</SegmentedControl.Item>
              <SegmentedControl.Item value="both">Side by side</SegmentedControl.Item>
            </SegmentedControl>
            {(detail?.appliedTerms.length ?? 0) > 0 && (
              <div className={styles.termChips}>
                <span>Terms in this chapter:</span>
                {detail?.appliedTerms.map(term => (
                  <StatusChip key={term.id} intent={term.status === 'suggested' ? 'warning' : term.stale ? 'danger' : 'success'}>
                    {term.sourceTerm} → {term.target}
                    {term.status === 'suggested' ? ' · pending' : term.stale ? ' · stale' : ''}
                  </StatusChip>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.detailBody}>
          {detailQuery.isLoading && <PaneLoader />}
          {detailQuery.error && !untranslated && <PaneError error={detailQuery.error} />}
          {untranslated && <div className="nf-emptynote">This chapter has an original but no translation yet. Run the pipeline to translate it.</div>}
          {untranslated && originalQuery.error && <PaneError error={originalQuery.error} />}

          {issues.length > 0 && (
            <div className={styles.issueBox}>
              <div className={styles.issueHead}>
                <span>
                  {issues.length} issue{issues.length === 1 ? '' : 's'} on this translation
                </span>
              </div>
              {issues.map((issue, position) => (
                <div key={position} className={styles.issueRow}>
                  <span className={styles.issueType}>
                    [{issue.source ?? 'fidelity'} · {issue.type ?? 'issue'}]
                  </span>
                  {issue.segmentIndex != null && `Paragraph ${issue.segmentIndex + 1}: `}
                  {issue.detail}
                  {issue.excerpt && ` — “${issue.excerpt}”`}
                </div>
              ))}
            </div>
          )}

          {editing ? (
            <div className={styles.editor}>
              <Textarea value={draft} onValueChange={setDraft} minRows={18} maxRows={40} aria-label="English text" />
              <div className={styles.editorActions}>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" loading={edit.isPending} onClick={saveEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.pairGrid} data-single={view !== 'both'}>
              {view !== 'english' && <div className={`${styles.pairHead} nf-eyebrow`}>Original</div>}
              {view !== 'original' && (
                <div className={`${styles.pairHead} nf-eyebrow`}>
                  <span>English</span>
                  {detail && detail.translation.status !== 'finalized' && <span>read-only until Edit English</span>}
                </div>
              )}
              {view === 'both' &&
                pairs.map((pair, position) => (
                  <Fragment key={position}>
                    <div className={styles.pairCellLeft}>{pair.original ?? ''}</div>
                    <div className={styles.pairCellRight}>{pair.english ?? ''}</div>
                  </Fragment>
                ))}
              {view === 'original' && <div className={styles.pairCellFull}>{original}</div>}
              {view === 'english' && <div className={styles.pairCellFull}>{english || '—'}</div>}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerNote}>
            Finalizing writes this English text into the novel as chapter {chapter} and locks it. The original is kept and stays visible here.
          </span>
          <div className={styles.footerActions}>
            <Button variant="ghost" size="sm" disabled={!previous} onClick={() => previous && onOpenChapter(previous.chapter, previous.page)}>
              ← Ch. {previous?.chapter ?? chapter - 1}
            </Button>
            <Button variant="ghost" size="sm" disabled={!next} onClick={() => next && onOpenChapter(next.chapter, next.page)}>
              Ch. {next?.chapter ?? chapter + 1} →
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={open => !open && setConfirm(null)}
        intent={confirm === 'reopen' ? 'danger' : 'primary'}
        title={confirm === 'reopen' ? `Reopen chapter ${chapter}?` : `Finalize chapter ${chapter}?`}
        description={
          confirm === 'reopen'
            ? 'The chapter goes back to translated so it can be re-run or edited. Its published text stays live until the next finalize replaces it.'
            : 'This writes the English text into the novel as that chapter and locks it. The original is kept.'
        }
        confirmLabel={confirm === 'reopen' ? 'Reopen' : 'Finalize'}
        loading={finalize.isPending || reopen.isPending}
        onConfirm={runConfirm}
      />
    </div>
  );
}

interface TermFormState {
  target: string;
  treatment: TranslationTreatment;
  category: TranslationGlossaryCategory;
  variants: string;
}

function termForm(term?: TranslationTermResponse): TermFormState {
  return {
    target: term?.target ?? '',
    treatment: term?.treatment ?? 'translate',
    category: term?.category ?? 'term',
    variants: (term?.variants ?? []).join(', '),
  };
}

function parseVariants(value: string): string[] {
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

interface ReviewQueueProps {
  novelId: string;
}

function ReviewQueue({ novelId }: ReviewQueueProps): React.JSX.Element {
  const queueQuery = useTranslationGlossaryQuery(novelId, { status: 'suggested', limit: QUEUE_LIMIT });
  const approve = useApproveTranslationTermMutation(novelId);
  const reject = useRejectTranslationTermMutation(novelId);
  const [origin, setOrigin] = useState<'all' | 'seed' | 'discovered'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TermFormState>(termForm());
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  const all = queueQuery.data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const terms = all.filter(
    term => (origin === 'all' || term.origin === origin) && (!needle || `${term.sourceTerm} ${term.target} ${term.meaning ?? ''}`.toLowerCase().includes(needle)),
  );
  const selected = terms.find(term => term.id === selectedId) ?? terms[0];

  if (selected && hydratedId !== selected.id) {
    setHydratedId(selected.id);
    setForm(termForm(selected));
  }

  const move = (delta: number): void => {
    if (!selected) return;
    const position = terms.findIndex(term => term.id === selected.id);
    const nextTerm = terms[Math.min(Math.max(position + delta, 0), terms.length - 1)];
    if (nextTerm) setSelectedId(nextTerm.id);
  };

  const decide = (decision: 'approve' | 'reject', overrides = false): void => {
    if (!selected) return;
    const after = (): void => {
      const position = terms.findIndex(term => term.id === selected.id);
      setSelectedId(terms[position + 1]?.id ?? null);
    };
    if (decision === 'reject') {
      reject.mutate(selected.id, { onSuccess: after, onError: err => toast.danger(err.message) });
      return;
    }
    approve.mutate(overrides ? { id: selected.id, target: form.target.trim(), treatment: form.treatment } : { id: selected.id }, {
      onSuccess: after,
      onError: err => toast.danger(err.message),
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Cmd/Ctrl+R and Cmd/Ctrl+A are the browser's; a bare letter is the queue's.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Radix renders its Select trigger as a button and portals the listbox, so a tagName check alone
      // lets the queue's letters hijack that typeahead.
      if (target?.closest('input, textarea, select, [role="combobox"], [role="listbox"], [role="dialog"], [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'j') move(1);
      else if (key === 'k') move(-1);
      else if (key === 'a') decide('approve');
      else if (key === 'r') decide('reject');
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const seedCount = all.filter(term => term.origin === 'seed').length;

  return (
    <div className={styles.splitPane}>
      <div className={styles.railPane}>
        <div className={styles.railHead}>
          <Input size="sm" value={search} onValueChange={setSearch} placeholder="Search suggestions…" clearable />
          <div className={styles.railFilters}>
            <button className={styles.railChip} data-active={origin === 'all'} onClick={() => setOrigin('all')}>
              All {all.length}
            </button>
            <button className={styles.railChip} data-active={origin === 'seed'} onClick={() => setOrigin('seed')}>
              From seed {seedCount}
            </button>
            <button className={styles.railChip} data-active={origin === 'discovered'} onClick={() => setOrigin('discovered')}>
              Discovered {all.length - seedCount}
            </button>
          </div>
        </div>
        <div className={styles.railList}>
          {queueQuery.isLoading && <PaneLoader />}
          {queueQuery.error && <PaneError error={queueQuery.error} />}
          {!queueQuery.isLoading && terms.length === 0 && <div className="nf-emptynote">Nothing waiting. Every term has been decided.</div>}
          {terms.map(term => (
            <button key={term.id} className="nf-selrow nf-selrow-stack" data-active={term.id === selected?.id} onClick={() => setSelectedId(term.id)}>
              <div className={styles.railRowTop}>
                <span className={styles.railTerm}>{term.sourceTerm}</span>
                <StatusChip intent="neutral">{term.category}</StatusChip>
              </div>
              <div className={styles.railTarget}>{term.target}</div>
              <div className={styles.railMeta}>{term.origin === 'seed' ? 'From seed' : `Found ch. ${term.createdChapter ?? '—'}`}</div>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.detailPane}>
        {!selected ? (
          <div className="nf-pane-empty">Select a suggestion to review.</div>
        ) : (
          <>
            <div className={styles.detailHead}>
              <div className={styles.detailTitleRow}>
                <div>
                  <div className={styles.detailHeading}>
                    <span className={styles.detailTerm}>{selected.sourceTerm}</span>
                    <StatusChip intent="warning" dot>
                      Suggested
                    </StatusChip>
                  </div>
                  {selected.meaning && <p className={styles.detailLead}>{selected.meaning}</p>}
                </div>
                <StatusChip intent="neutral">{selected.origin === 'seed' ? 'From the seed pass' : `Discovered in chapter ${selected.createdChapter ?? '—'}`}</StatusChip>
              </div>
            </div>

            <div className={styles.detailBody}>
              <div className={styles.detailGrid}>
                <div>
                  <FormField label="English term">
                    <Input value={form.target} onValueChange={value => setForm({ ...form, target: value })} />
                  </FormField>
                  {(selected.alternatives?.length ?? 0) > 0 && (
                    <div className={styles.altRow}>
                      <span>Alternatives:</span>
                      {selected.alternatives?.map(alternative => (
                        <button key={alternative.target} className={styles.altChip} title={alternative.rationale} onClick={() => setForm({ ...form, target: alternative.target })}>
                          {alternative.target}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <FormField label="Treatment" helper="Translate renders the meaning; transliterate keeps the sound; keep as is leaves the original characters in the English text.">
                  <SegmentedControl value={form.treatment} onValueChange={value => setForm({ ...form, treatment: value as TranslationTreatment })} size="sm" fullWidth>
                    {TREATMENTS.map(treatment => (
                      <SegmentedControl.Item key={treatment} value={treatment}>
                        {TREATMENT_LABEL[treatment]}
                      </SegmentedControl.Item>
                    ))}
                  </SegmentedControl>
                </FormField>
              </div>

              <div className={styles.detailGrid}>
                <FormField label="Category">
                  <Select value={form.category} onValueChange={value => setForm({ ...form, category: value as TranslationGlossaryCategory })} aria-label="Category">
                    {GLOSSARY_CATEGORIES.map(category => (
                      <Select.Item key={category} value={category}>
                        {category}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Also written as">
                  <Input value={form.variants} onValueChange={value => setForm({ ...form, variants: value })} placeholder="Comma-separated" />
                </FormField>
              </div>

              {selected.contextExcerpt && (
                <div>
                  <div className={styles.fieldLabel}>Where it first appears</div>
                  <div className={styles.excerptBox}>
                    <div>{selected.contextExcerpt}</div>
                  </div>
                </div>
              )}

              {selected.notes && (
                <div>
                  <div className={styles.fieldLabel}>Why the model flagged it</div>
                  <p className={styles.fieldNote}>{selected.notes}</p>
                </div>
              )}
            </div>

            <div className={styles.footer}>
              <div className={styles.hotkeys}>
                <Kbd keys="J" />
                <Kbd keys="K" /> next / previous · <Kbd keys="A" /> approve · <Kbd keys="R" /> reject
              </div>
              <div className={styles.footerActions}>
                <Button variant="danger" loading={reject.isPending} onClick={() => decide('reject')}>
                  Not a term
                </Button>
                <Button variant="secondary" loading={approve.isPending} disabled={!form.target.trim()} onClick={() => decide('approve', true)}>
                  Approve with changes
                </Button>
                <Button variant="primary" loading={approve.isPending} onClick={() => decide('approve')}>
                  Approve “{selected.target}”
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface GlossaryTableProps {
  novelId: string;
  page: number;
  onPage: (page: number) => void;
}

function GlossaryTable({ novelId, page, onPage }: GlossaryTableProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | TranslationGlossaryCategory>('all');
  const [treatment, setTreatment] = useState<'all' | TranslationTreatment>('all');
  const [editing, setEditing] = useState<TranslationTermResponse | null>(null);

  const params = useMemo(
    () => ({
      status: 'approved' as const,
      page,
      limit: GLOSSARY_PAGE_SIZE,
      q: search.trim() || undefined,
      category: category === 'all' ? undefined : category,
      treatment: treatment === 'all' ? undefined : treatment,
    }),
    [page, search, category, treatment],
  );
  const glossaryQuery = useTranslationGlossaryQuery(novelId, params);
  const total = glossaryQuery.data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * GLOSSARY_PAGE_SIZE + 1;
  const last = Math.min(page * GLOSSARY_PAGE_SIZE, total);

  return (
    <>
      <div className={styles.filterRow}>
        <div className={styles.filters}>
          <Input
            size="sm"
            className={styles.filterInput}
            value={search}
            onValueChange={value => (setSearch(value), onPage(1))}
            placeholder="Search original, English or meaning…"
            clearable
          />
          <Select
            value={category}
            onValueChange={value => (setCategory(value as typeof category), onPage(1))}
            size="sm"
            className={styles.filterSelect}
            aria-label="Filter by category"
          >
            <Select.Item value="all">All categories</Select.Item>
            {GLOSSARY_CATEGORIES.map(entry => (
              <Select.Item key={entry} value={entry}>
                {entry}
              </Select.Item>
            ))}
          </Select>
          <Select
            value={treatment}
            onValueChange={value => (setTreatment(value as typeof treatment), onPage(1))}
            size="sm"
            className={styles.filterSelect}
            aria-label="Filter by treatment"
          >
            <Select.Item value="all">All treatments</Select.Item>
            {TREATMENTS.map(entry => (
              <Select.Item key={entry} value={entry}>
                {TREATMENT_LABEL[entry]}
              </Select.Item>
            ))}
          </Select>
        </div>
      </div>

      <QueryState
        isLoading={glossaryQuery.isLoading}
        error={glossaryQuery.error}
        isEmpty={total === 0}
        emptyTitle="No approved terms yet"
        emptyDescription="Approve suggestions in the review queue and they land here."
      >
        <div className={styles.table}>
          <div className={`${styles.headerRow} ${styles.glossaryHeaderRow}`}>
            <span>Original</span>
            <span>English</span>
            <span>Meaning</span>
            <span>Category</span>
            <span>Treatment</span>
            <span className={styles.headerActions} />
          </div>
          {glossaryQuery.data?.items.map(term => (
            <div key={term.id} className={`${styles.row} ${styles.glossaryRow}`}>
              <span className={styles.rowSource}>{term.sourceTerm}</span>
              <span className={styles.rowTitle}>{term.target}</span>
              <span className={styles.rowSub}>{term.meaning ?? '—'}</span>
              <span className={styles.rowSub}>{term.category}</span>
              <span>
                <StatusChip intent={TREATMENT_INTENT[term.treatment]}>{TREATMENT_LABEL[term.treatment]}</StatusChip>
              </span>
              <span className={styles.rowActions}>
                <Button variant="text" size="sm" onClick={() => setEditing(term)}>
                  Edit
                </Button>
              </span>
            </div>
          ))}
          <div className={styles.tableFoot}>
            <span>
              Showing {first}–{last} of {total} terms
            </span>
            <Pagination page={page} total={total} pageSize={GLOSSARY_PAGE_SIZE} onPageChange={onPage} summary={false} compact />
          </div>
        </div>
      </QueryState>

      <GlossaryDrawer novelId={novelId} term={editing} onClose={() => setEditing(null)} />
    </>
  );
}

interface GlossaryDrawerProps {
  novelId: string;
  term: TranslationTermResponse | null;
  onClose: () => void;
}

function GlossaryDrawer({ novelId, term, onClose }: GlossaryDrawerProps): React.JSX.Element {
  const update = useUpdateTranslationTermMutation(novelId);
  const reject = useRejectTranslationTermMutation(novelId);
  const [form, setForm] = useState<TermFormState>(termForm());
  const [meaning, setMeaning] = useState('');
  const [notes, setNotes] = useState('');
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  if (term && hydratedId !== term.id) {
    setHydratedId(term.id);
    setForm(termForm(term));
    setMeaning(term.meaning ?? '');
    setNotes(term.notes ?? '');
  }
  if (!term && hydratedId !== null) setHydratedId(null);

  const save = (): void => {
    if (!term) return;
    update.mutate(
      {
        id: term.id,
        target: form.target.trim(),
        treatment: form.treatment,
        category: form.category,
        variants: parseVariants(form.variants),
        meaning: meaning.trim() || null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Term saved');
          onClose();
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const targetChanged = Boolean(term) && form.target.trim() !== term?.target;

  return (
    <Drawer open={term !== null} onOpenChange={open => !open && onClose()} placement="right" size="lg">
      <Drawer.Header title={term?.sourceTerm ?? ''} meta={term ? `${term.category} · ${term.origin} · revision ${term.revision}` : undefined} />
      <Drawer.Body>
        <div className={styles.drawerSection}>
          <FormField label="English term">
            <Input value={form.target} onValueChange={value => setForm({ ...form, target: value })} />
          </FormField>
          <FormField label="Treatment">
            <SegmentedControl value={form.treatment} onValueChange={value => setForm({ ...form, treatment: value as TranslationTreatment })} size="sm" fullWidth>
              {TREATMENTS.map(entry => (
                <SegmentedControl.Item key={entry} value={entry}>
                  {TREATMENT_LABEL[entry]}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          </FormField>
          <div className={styles.detailGrid}>
            <FormField label="Category">
              <Select value={form.category} onValueChange={value => setForm({ ...form, category: value as TranslationGlossaryCategory })} aria-label="Category">
                {GLOSSARY_CATEGORIES.map(entry => (
                  <Select.Item key={entry} value={entry}>
                    {entry}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <FormField label="Also written as">
              <Input value={form.variants} onValueChange={value => setForm({ ...form, variants: value })} placeholder="Comma-separated" />
            </FormField>
          </div>
          <FormField label="Meaning">
            <Textarea value={meaning} onValueChange={setMeaning} minRows={2} />
          </FormField>
          <FormField label="Translator note" optional>
            <Textarea value={notes} onValueChange={setNotes} minRows={2} />
          </FormField>
          {targetChanged && (
            <div className={styles.warnBox}>
              <WarningIcon size={16} className={styles.warnIcon} />
              <span>
                <b>Changing the English term marks every chapter that used it as stale</b>, finalized and published ones included. They keep their current text until they are
                re-run; the Chapters tab’s Stale filter lists them.
              </span>
            </div>
          )}
        </div>
      </Drawer.Body>
      <Drawer.Footer>
        <div className={styles.drawerFooter}>
          <Button variant="danger" loading={reject.isPending} onClick={() => term && reject.mutate(term.id, { onSuccess: onClose, onError: err => toast.danger(err.message) })}>
            Mark as not a term
          </Button>
          <div className={styles.drawerFooterActions}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={update.isPending} disabled={!form.target.trim()} onClick={save}>
              Save term
            </Button>
          </div>
        </div>
      </Drawer.Footer>
    </Drawer>
  );
}

interface RejectedListProps {
  novelId: string;
}

function RejectedList({ novelId }: RejectedListProps): React.JSX.Element {
  const rejectedQuery = useTranslationGlossaryQuery(novelId, { status: 'rejected', limit: QUEUE_LIMIT });
  const items = rejectedQuery.data?.items ?? [];
  return (
    <QueryState
      isLoading={rejectedQuery.isLoading}
      error={rejectedQuery.error}
      isEmpty={items.length === 0}
      emptyTitle="Nothing marked as not a term"
      emptyDescription="Rejecting a suggestion tells the model to translate that wording normally and stops it being suggested again."
    >
      <div className={styles.table}>
        <div className={`${styles.headerRow} ${styles.glossaryHeaderRow}`}>
          <span>Original</span>
          <span>Suggested English</span>
          <span>Meaning</span>
          <span>Category</span>
          <span>Treatment</span>
          <span className={styles.headerActions} />
        </div>
        {items.map(term => (
          <div key={term.id} className={`${styles.row} ${styles.glossaryRow}`}>
            <span className={styles.rowSource}>{term.sourceTerm}</span>
            <span className={styles.rowTitle}>{term.target}</span>
            <span className={styles.rowSub}>{term.meaning ?? '—'}</span>
            <span className={styles.rowSub}>{term.category}</span>
            <span className={styles.rowSub}>{TREATMENT_LABEL[term.treatment]}</span>
            <span />
          </div>
        ))}
      </div>
    </QueryState>
  );
}

interface AddTermDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddTermDialog({ novelId, open, onOpenChange }: AddTermDialogProps): React.JSX.Element {
  const create = useCreateTranslationTermMutation(novelId);
  const [sourceTerm, setSourceTerm] = useState('');
  const [form, setForm] = useState<TermFormState>(termForm());
  const [meaning, setMeaning] = useState('');

  const submit = (): void => {
    create.mutate(
      {
        sourceTerm: sourceTerm.trim(),
        target: form.target.trim(),
        category: form.category,
        treatment: form.treatment,
        variants: parseVariants(form.variants),
        meaning: meaning.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Term added');
          setSourceTerm('');
          setForm(termForm());
          setMeaning('');
          onOpenChange(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="Add term" description="A manual entry is approved straight away and binds every chapter translated from now on." />
        <Dialog.Body>
          <FormField label="Original term" required error={create.error?.fieldErrors.sourceTerm}>
            <Input value={sourceTerm} onValueChange={setSourceTerm} />
          </FormField>
          <FormField label="English term" required>
            <Input value={form.target} onValueChange={value => setForm({ ...form, target: value })} />
          </FormField>
          <div className={styles.detailGrid}>
            <FormField label="Category">
              <Select value={form.category} onValueChange={value => setForm({ ...form, category: value as TranslationGlossaryCategory })} aria-label="Category">
                {GLOSSARY_CATEGORIES.map(entry => (
                  <Select.Item key={entry} value={entry}>
                    {entry}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <FormField label="Treatment">
              <Select value={form.treatment} onValueChange={value => setForm({ ...form, treatment: value as TranslationTreatment })} aria-label="Treatment">
                {TREATMENTS.map(entry => (
                  <Select.Item key={entry} value={entry}>
                    {TREATMENT_LABEL[entry]}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Meaning" optional>
            <Textarea value={meaning} onValueChange={setMeaning} minRows={2} />
          </FormField>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} disabled={!sourceTerm.trim() || !form.target.trim()} onClick={submit}>
            Add term
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function TranslationScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const statusQuery = useTranslationStatusQuery(novelId);
  const status = statusQuery.data;
  const active = translationJobActive(status);
  const start = useStartTranslationMutation(novelId);
  const decisions = useTranslationTermDecisionsMutation(novelId);
  const [dialog, setDialog] = useState<{ mode: 'add' | 'edit'; chapter: number } | null>(null);
  const [addingTerm, setAddingTerm] = useState(false);

  const setSearch = (patch: Partial<TranslationSearch>): void => void navigate({ search: { ...search, ...patch } });

  const counts = status?.counts;
  const glossary = status?.glossary;
  const lastChapterQuery = useLastOriginalChapterQuery(novelId, counts?.originals ?? 0);
  const lastChapter = lastChapterQuery.data?.items[0]?.chapter ?? 0;
  const nextChapter = lastChapter + 1;
  const label = startActionLabel(status?.translation.phase ?? 'pending', glossary?.suggested ?? 0);

  // Same key as the queue pane's own query, so mounting it here for the bulk action costs no extra request.
  const inQueue = search.tab === 'terminology' && search.view === 'queue';
  const queueQuery = useTranslationGlossaryQuery(novelId, { status: 'suggested', limit: QUEUE_LIMIT }, inQueue);

  // The bulk endpoint names ids, so this approves the suggestions actually loaded — the label says so
  // whenever the queue's total runs past the page cap.
  const loadedSuggestions = queueQuery.data?.items ?? [];
  const suggestionTotal = queueQuery.data?.total ?? loadedSuggestions.length;
  const approveAllLabel =
    suggestionTotal > loadedSuggestions.length
      ? `Approve these ${loadedSuggestions.length} (${loadedSuggestions.length} of ${suggestionTotal} loaded)`
      : `Approve these ${loadedSuggestions.length}`;

  const approveAll = (): void => {
    const items: TranslationTermDecision[] = loadedSuggestions.map(term => ({ id: term.id, decision: 'approve' }));
    if (items.length === 0) return;
    decisions.mutate(items, { onSuccess: result => toast.success(`${result.approved} terms approved`), onError: err => toast.danger(err.message) });
  };

  return (
    <div className={`nf-page ${styles.page}`}>
      <PageHeader
        title="Translation"
        subtitle={`${languageName(status?.originalLanguage) ?? 'Original'} → English. Originals stay untouched; a chapter becomes the novel’s English text only when you finalize it.`}
        extra={
          <>
            <Button variant="secondary" prefix={<DownloadIcon />} disabled={(counts?.finalized ?? 0) === 0} onClick={() => downloadManuscript(novelId)}>
              Download manuscript
            </Button>
            <Button variant="secondary" prefix={<PlusIcon />} onClick={() => setDialog({ mode: 'add', chapter: nextChapter })}>
              Add chapter
            </Button>
            <Button
              variant="primary"
              loading={start.isPending}
              disabled={active || (counts?.originals ?? 0) === 0}
              onClick={() => start.mutate(undefined, { onSuccess: () => toast.success('Translation started'), onError: err => toast.danger(err.message) })}
            >
              {active ? 'Running…' : label}
            </Button>
          </>
        }
      />

      <QueryState isLoading={statusQuery.isLoading} error={statusQuery.error}>
        <div>
          {search.chapter == null && (
            <div className={styles.cards}>
              {status && <ProgressCard novelId={novelId} status={status} onOpenQueue={() => setSearch({ tab: 'terminology', view: 'queue' })} />}
              <SetupCard novelId={novelId} status={status} />
            </div>
          )}

          {search.chapter != null ? (
            <ChapterReview
              novelId={novelId}
              chapter={search.chapter}
              status={status}
              page={search.page}
              filter={search.filter}
              onBack={() => setSearch({ chapter: undefined })}
              onOpenChapter={(chapter, page) => setSearch(page === undefined ? { chapter } : { chapter, page })}
            />
          ) : (
            <>
              <div className={styles.tabsRow}>
                <SegmentedControl value={search.tab} onValueChange={value => setSearch({ tab: value as TranslationTab, page: 1 })}>
                  <SegmentedControl.Item value="chapters">Chapters</SegmentedControl.Item>
                  <SegmentedControl.Item value="terminology">
                    Terminology {(glossary?.suggested ?? 0) > 0 && <StatusChip intent="warning">{glossary?.suggested}</StatusChip>}
                  </SegmentedControl.Item>
                </SegmentedControl>
                {search.tab === 'terminology' && (
                  <div className={styles.filters}>
                    <SegmentedControl value={search.view} onValueChange={value => setSearch({ view: value as TerminologyView, page: 1 })} size="sm">
                      <SegmentedControl.Item value="queue">Review queue · {glossary?.suggested ?? 0}</SegmentedControl.Item>
                      <SegmentedControl.Item value="glossary">Glossary · {glossary?.approved ?? 0}</SegmentedControl.Item>
                      <SegmentedControl.Item value="rejected">Not terms · {glossary?.rejected ?? 0}</SegmentedControl.Item>
                    </SegmentedControl>
                    <Button variant="secondary" size="sm" onClick={() => setAddingTerm(true)}>
                      Add term
                    </Button>
                    {search.view === 'queue' && loadedSuggestions.length > 0 && (
                      <Button variant="primary" size="sm" loading={decisions.isPending} onClick={approveAll}>
                        {approveAllLabel}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {search.tab === 'chapters' && (
                <ChaptersTab
                  novelId={novelId}
                  status={status}
                  page={search.page}
                  filter={search.filter}
                  lastChapter={lastChapter}
                  onPage={page => setSearch({ page })}
                  onFilter={filter => setSearch({ filter, page: 1 })}
                  onOpenChapter={chapter => setSearch({ chapter })}
                  onEditOriginal={chapter => setDialog({ mode: 'edit', chapter })}
                  onAddChapter={() => setDialog({ mode: 'add', chapter: nextChapter })}
                />
              )}
              {search.tab === 'terminology' && search.view === 'queue' && <ReviewQueue novelId={novelId} />}
              {search.tab === 'terminology' && search.view === 'glossary' && <GlossaryTable novelId={novelId} page={search.page} onPage={page => setSearch({ page })} />}
              {search.tab === 'terminology' && search.view === 'rejected' && <RejectedList novelId={novelId} />}
            </>
          )}
        </div>
      </QueryState>

      {dialog && (
        <OriginalDialog novelId={novelId} open onOpenChange={open => !open && setDialog(null)} chapter={dialog.chapter} mode={dialog.mode} language={status?.originalLanguage} />
      )}
      <AddTermDialog novelId={novelId} open={addingTerm} onOpenChange={setAddingTerm} />
    </div>
  );
}
