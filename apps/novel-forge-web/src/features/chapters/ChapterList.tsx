import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, ButtonGroup, ChevronDownIcon, ChevronRightIcon, Dialog, DropdownMenu, PlusIcon, toast, Tooltip } from '@shadow-library/ui';

import { TrashIcon, UploadIcon } from '@/components/icons';
import { GenerationStatus, PaneError, PaneLoader, QueryState, RowAction, StatusChip, StopButton } from '@/components/nf';
import { ChapterToolbar, ChapterToolbarStatus, GoalMetDialog, VolumeList, VolumeNote, VolumeSection } from '@/features/chapter-list';
import {
  type ChapterRowResponse,
  type ListChapterRowsQueryParams,
  useChapterRowMatches,
  useChapterRowsQuery,
  useDeleteDraftMutation,
  useGenerateMutation,
  useListEntitiesQuery,
  useListPromisesQuery,
  useListVolumesQuery,
  useStartNextDraftMutation,
} from '@/lib/apis';
import {
  type ChapterCounts,
  type ChapterGroup,
  type ChapterShow,
  chaptersOnPage,
  chaptersSubtitle,
  clampGroupPages,
  currentPageOf,
  emptyVolumeNote,
  goalMetLabel,
  groupChaptersByVolume,
  jumpToChapter,
  nextVolumeGroup,
  opensByDefault,
  rowsWindow,
  rowVisible,
  showCounts,
  visibleChapters,
} from '@/lib/chapter-list';
import { batchStopNotice, rowApprovedLabel, rowChangedSinceApproval, teachingGateRefusal } from '@/lib/chapter-workspace';
import { chapterGeneration } from '@/lib/generation-activity';
import { useGenerationActivity } from '@/lib/use-generation-activity';

import { statusMeta } from './chapter-status';
import { UnrestrictedBadge } from './UnrestrictedBadge';
import { activateOnKey, formatChapterNumber } from './chapter-format';
import { InsertChapterDialog } from './InsertChapterDialog';
import { type FillMode, FillSlotDialog } from './FillSlotDialog';
import { BriefDrawer } from './BriefDrawer';
import { ChapterSearchResults } from './ChapterSearchResults';
import styles from './chapters.module.css';

export interface ChapterListView {
  show?: ChapterShow;
  /** Entity key of the point-of-view character to filter by. */
  pov?: string;
  /** Key of the plot thread to filter by. */
  thread?: string;
  /** Prose search; while set, search hits replace the volume groups. */
  q?: string;
  /** Page of the search hits. */
  page?: number;
  /** Page each volume shows, by volume key; a volume missing here opens on its default page. */
  pages?: Record<string, number>;
}

// The list's whole-novel figures (counts, every chapter number, the next chapter) come with any page, so the smallest one is asked for.
export const SUMMARY_ROWS: ListChapterRowsQueryParams = { filter: 'all', limit: 1, offset: 0 };

const EMPTY_COUNTS: ChapterCounts = { all: 0, not_written: 0, needs_review: 0, draft: 0, final: 0 };

interface GroupRowsProps {
  novelId: string;
  label: string;
  allChapters: readonly number[];
  pageChapters: readonly number[];
  show: ChapterShow;
  matches?: ReadonlySet<number>;
  renderRow: (row: ChapterRowResponse) => React.JSX.Element;
}

function GroupRows({ novelId, label, allChapters, pageChapters, show, matches, renderRow }: GroupRowsProps): React.JSX.Element {
  const pageRows = rowsWindow(allChapters, pageChapters);
  const rowsQuery = useChapterRowsQuery(novelId, { filter: 'all', ...(pageRows ?? { offset: 0, limit: 1 }) }, Boolean(pageRows));
  if (rowsQuery.isLoading) return <PaneLoader />;
  if (rowsQuery.error) return <PaneError error={rowsQuery.error} />;

  const onPage = new Set(pageChapters);
  const rows = (rowsQuery.data?.items ?? []).filter(row => (rowsQuery.isPlaceholderData || onPage.has(row.chapter)) && rowVisible(row, show, matches));
  if (rows.length === 0) return <VolumeNote>No chapters on this page match the filters.</VolumeNote>;
  return (
    <ul className={`${styles.listBody} ${styles.listBodyNested}`} aria-label={label} aria-busy={rowsQuery.isPlaceholderData || undefined}>
      {rows.map(renderRow)}
    </ul>
  );
}

interface ChapterListProps {
  novelId: string;
  view: ChapterListView;
  onOpen: (n: number) => void;
  onView: (view: ChapterListView, replace?: boolean) => void;
}

export function ChapterList({ novelId, view, onOpen, onView }: ChapterListProps): React.JSX.Element {
  const { show = 'all', pov, thread, q, page = 1, pages } = view;
  const summaryQuery = useChapterRowsQuery(novelId, SUMMARY_ROWS);
  const volumesQuery = useListVolumesQuery(novelId);
  const charactersQuery = useListEntitiesQuery(novelId, { type: 'character', limit: 500 });
  const threadsQuery = useListPromisesQuery(novelId, { kind: 'thread', limit: 100 });
  const matches = useChapterRowMatches(novelId, { pov, thread });
  const generate = useGenerateMutation(novelId);
  const { activity, stop, stopping } = useGenerationActivity(novelId);
  const data = summaryQuery.data;
  const counts = data?.counts ?? EMPTY_COUNTS;
  const chapters = useMemo(() => data?.chapters ?? [], [data?.chapters]);
  const volumes = useMemo(() => volumesQuery.data?.items ?? [], [volumesQuery.data?.items]);
  const groups = useMemo(() => groupChaptersByVolume(volumes, chapters), [volumes, chapters]);
  const povOptions = useMemo(() => (charactersQuery.data?.items ?? []).map(entity => ({ key: entity.entityKey, name: entity.name })), [charactersQuery.data?.items]);
  const threadOptions = useMemo(() => (threadsQuery.data?.items ?? []).map(promise => ({ key: promise.key, name: promise.label })), [threadsQuery.data?.items]);
  const nextBriefChapter = data?.nextBriefChapter ?? undefined;
  const nextManualChapter = data?.nextWritableChapter ?? 1;
  const contradiction = data?.contradiction ?? undefined;
  const frontier = data?.frontier ?? 0;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [highlight, setHighlight] = useState<{ chapter: number; focus: boolean } | undefined>();
  const [jumpMessage, setJumpMessage] = useState<string | undefined>();
  const [goalMetGroup, setGoalMetGroup] = useState<ChapterGroup | undefined>();
  const isOpen = useCallback((group: ChapterGroup): boolean => openGroups[group.key] ?? opensByDefault(group), [openGroups]);
  const scrollIntoView = useCallback((element: HTMLElement | null) => element?.scrollIntoView({ block: 'center' }), []);
  const focusRow = useCallback((element: HTMLElement | null) => {
    element?.scrollIntoView({ block: 'center' });
    element?.querySelector<HTMLElement>('[role="button"]')?.focus({ preventScroll: true });
  }, []);
  const highlightRef = highlight?.focus ? focusRow : scrollIntoView;

  // Judge + repair costs more per draft, so it stays a per-run choice — on by default per product decision.
  const [autoFix, setAutoFix] = useState(true);
  const [briefChapter, setBriefChapter] = useState<number | undefined>();
  const [teachingRefusal, setTeachingRefusal] = useState<{ chapter: number; message: string } | undefined>();

  // Generation gates mirror the backend (DRF_003); surface the reason rather than let the call throw.
  const generateReason = !nextBriefChapter
    ? 'No brief to generate from — write it yourself'
    : contradiction
      ? `Resolve chapter ${contradiction.chapter}’s flagged contradiction first`
      : undefined;
  const canGenerate = !generateReason && !activity;

  const writeYourself = useStartNextDraftMutation(novelId);

  // Go to chapter clears search and filters so the chapter it lands on is always shown; revealing a chapter being written keeps them.
  const jump = (text: string, announce = true): void => {
    const target = jumpToChapter(groups, text, nextManualChapter);
    setJumpMessage(announce ? target.message : undefined);
    if (target.kind === 'missing') {
      setHighlight(undefined);
      return;
    }
    setHighlight({ chapter: target.chapter, focus: announce });
    setOpenGroups(previous => ({ ...previous, [target.groupKey]: true }));
    const reset: ChapterListView = announce ? { q: undefined, page: undefined, show: undefined, pov: undefined, thread: undefined } : {};
    onView({ ...reset, pages: { ...pages, [target.groupKey]: target.page } });
  };

  const reveal = (chapter: number): void => jump(String(chapter), false);

  const loaded = Boolean(summaryQuery.data && volumesQuery.data);
  const clampedPages = loaded ? JSON.stringify(clampGroupPages(groups, pages) ?? null) : 'null';
  useEffect(() => {
    const corrected = JSON.parse(clampedPages) as Record<string, number> | null;
    if (corrected) onView({ pages: corrected }, true);
  }, [clampedPages, onView]);

  // A batch truncates rather than skips at an external-write slot, a gap left by an undrafted chapter, or a chapter
  // that teaches its characters something; the toast gives immediate feedback on *this* run.
  const runGenerate = (limit: number): void => {
    const target = nextBriefChapter;
    setTeachingRefusal(undefined);
    generate.mutate(
      { limit, autoFix },
      {
        onSuccess: job => {
          const notice = batchStopNotice(job);
          if (notice) toast.warning(notice);
          setBriefChapter(undefined);
          if (target) reveal(target);
        },
        onError: e => {
          const refusal = teachingGateRefusal(e);
          if (!refusal) {
            toast.danger(e.message);
            return;
          }
          setBriefChapter(undefined);
          setTeachingRefusal({ chapter: target ?? nextManualChapter, message: refusal });
        },
      },
    );
  };

  const startGeneration = (): void => runGenerate(1);

  const startBatch = (): void => runGenerate(5);

  const writeManually = (): void => {
    if (activity) return;
    writeYourself.mutate(undefined, { onSuccess: created => onOpen(created.chapter), onError: e => toast.danger(e.message) });
  };

  const deleteDraft = useDeleteDraftMutation(novelId);
  const [deleteTarget, setDeleteTarget] = useState<ChapterRowResponse | undefined>();
  const [insertAfter, setInsertAfter] = useState<number | undefined>();
  const [fillTarget, setFillTarget] = useState<{ chapter: number; mode: FillMode } | undefined>();
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

  const visible = visibleChapters(groups, isOpen, pages);
  const offscreen = activity && !q && !visible.has(activity.current) ? activity : undefined;
  const offscreenGeneration = offscreen && chapterGeneration(offscreen, offscreen.current);
  const briefIsNext = briefChapter !== undefined && briefChapter === nextBriefChapter;
  const ungrouped = volumes.length === 0;

  const renderRow = (row: ChapterRowResponse): React.JSX.Element => {
    const generation = chapterGeneration(activity, row.chapter);
    const writing = generation?.phase === 'writing';
    const stopAction = writing && <StopButton onStop={stop} stopping={stopping} />;
    const highlighted = row.chapter === highlight?.chapter;
    const highlightClass = highlighted ? styles.rowHighlight : '';

    if (row.kind === 'planned') {
      const openBrief = (): void => setBriefChapter(row.chapter);
      return (
        <li key={`slot-${row.chapter}`} ref={highlighted ? highlightRef : undefined}>
          <div
            role="button"
            tabIndex={0}
            aria-label={`View the brief for chapter ${row.chapter}: ${row.title ?? 'Untitled chapter'}`}
            className={`nf-selrow ${styles.row} ${styles.rowPlanned} ${highlightClass}`}
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
                (!generation && row.chapter === nextManualChapter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    prefix={<UploadIcon size={14} />}
                    onClick={event => {
                      event.stopPropagation();
                      setFillTarget({ chapter: row.chapter, mode: 'generate' });
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
    const changed = rowChangedSinceApproval(row);
    const words = row.wordCount ?? 0;
    const open = (): void => onOpen(row.chapter);
    return (
      <li key={`draft-${row.chapter}`} ref={highlighted ? highlightRef : undefined}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Open chapter ${row.chapter}: ${row.title ?? 'Untitled chapter'}`}
          className={`nf-selrow ${styles.row} ${styles.rowWritten} ${highlightClass}`}
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
              <Tooltip
                content={row.isolated ? 'Finalize is refused until this chapter has a summary and continuation state.' : 'Finalize is refused until this chapter has a summary.'}
              >
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
                <StatusChip intent={changed ? 'warning' : meta.intent} dot>
                  {changed ? 'Changed since approved' : (rowApprovedLabel(row) ?? meta.label)}
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
  };

  const renderGroup = (group: ChapterGroup): React.JSX.Element => {
    const groupPage = currentPageOf(group, pages);
    const next = nextVolumeGroup(groups, group.key);
    const goalMet = group.volume?.state === 'active' ? { label: goalMetLabel(group, next), onClick: () => setGoalMetGroup(group) } : undefined;
    return (
      <VolumeSection
        key={group.key}
        group={group}
        open={isOpen(group)}
        onToggle={() => setOpenGroups(previous => ({ ...previous, [group.key]: !isOpen(group) }))}
        page={groupPage}
        onPage={nextPage => {
          setHighlight(undefined);
          onView({ pages: { ...pages, [group.key]: nextPage } });
        }}
        goalMet={goalMet}
      >
        {group.chapters.length === 0 ? (
          <VolumeNote>{emptyVolumeNote(group, groups)}</VolumeNote>
        ) : matches.error ? (
          <PaneError error={matches.error} />
        ) : matches.isLoading ? (
          <PaneLoader />
        ) : (
          <GroupRows
            novelId={novelId}
            label={group.number ? `Chapters in volume ${group.number}` : 'Chapters'}
            allChapters={chapters}
            pageChapters={chaptersOnPage(group, groupPage)}
            show={show}
            matches={matches.chapters}
            renderRow={renderRow}
          />
        )}
      </VolumeSection>
    );
  };

  return (
    <div className={`nf-scroll ${styles.screenScroll}`}>
      <div className={`nf-page ${styles.listInner}`}>
        <div className={styles.listHead}>
          <div className={styles.listHeadMain}>
            <h1 className={styles.title}>Chapters</h1>
            <p className={styles.subtitle}>{chaptersSubtitle(counts, data?.totalWords ?? 0, volumes)}</p>
          </div>
          <div className={styles.listActions}>
            <Button variant="secondary" disabled={Boolean(activity)} onClick={() => setFillTarget({ chapter: nextManualChapter, mode: 'paste' })}>
              Import chapters
            </Button>
            <Button variant="secondary" disabled={Boolean(activity)} loading={writeYourself.isPending} onClick={writeManually}>
              Write chapter {nextManualChapter} myself
            </Button>
            <ButtonGroup variant="primary" aria-label="Chapter creation">
              <Button loading={generate.isPending || writeYourself.isPending || Boolean(activity)} prefix={<PlusIcon />} onClick={canGenerate ? startGeneration : writeManually}>
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
                  <DropdownMenu.Item disabled={Boolean(activity) || writeYourself.isPending} onSelect={writeManually}>
                    Write ch {nextManualChapter} yourself
                  </DropdownMenu.Item>
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

        {teachingRefusal && (
          <Alert
            intent="warning"
            title={`The AI can’t write chapter ${teachingRefusal.chapter} yet`}
            action={{ label: `Write chapter ${nextManualChapter} yourself`, onClick: writeManually }}
            onDismiss={() => setTeachingRefusal(undefined)}
            className={styles.notice}
          >
            {teachingRefusal.message}
          </Alert>
        )}

        <ChapterToolbar
          show={show}
          counts={showCounts(counts)}
          onShow={next => onView({ show: next === 'all' ? undefined : next })}
          povOptions={povOptions}
          pov={pov}
          onPov={next => onView({ pov: next })}
          threadOptions={threadOptions}
          thread={thread}
          onThread={next => onView({ thread: next })}
          query={q}
          onSearch={next => onView({ q: next, page: undefined })}
          onJump={text => jump(text)}
        />
        {jumpMessage && <ChapterToolbarStatus>{jumpMessage}</ChapterToolbarStatus>}

        {q ? (
          <ChapterSearchResults novelId={novelId} query={q} pov={pov} thread={thread} page={page} onPage={next => onView({ page: next })} onOpen={onOpen} />
        ) : (
          <QueryState
            isLoading={summaryQuery.isLoading || volumesQuery.isLoading}
            error={summaryQuery.error ?? volumesQuery.error}
            isEmpty={counts.all === 0 && ungrouped}
            emptyTitle="No chapters yet"
            emptyDescription={canGenerate ? 'Generate your first chapter from its brief.' : generateReason}
            emptyAction={{ label: canGenerate ? 'Generate first chapter' : 'Write chapter 1', onClick: canGenerate ? startGeneration : writeManually }}
          >
            <VolumeList>{groups.map(renderGroup)}</VolumeList>
          </QueryState>
        )}
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

      {fillTarget !== undefined && (
        <FillSlotDialog novelId={novelId} chapter={fillTarget.chapter} initialMode={fillTarget.mode} onOpenChange={open => !open && setFillTarget(undefined)} onFilled={onOpen} />
      )}

      {goalMetGroup && (
        <GoalMetDialog novelId={novelId} group={goalMetGroup} next={nextVolumeGroup(groups, goalMetGroup.key)} onOpenChange={open => !open && setGoalMetGroup(undefined)} />
      )}

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
