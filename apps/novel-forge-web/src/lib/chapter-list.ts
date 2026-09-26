import { type ChapterRowCountsResponse, type ChapterRowFilter, type ChapterRowKind, type DraftStatus, type VolumeResponse, type VolumeState } from '@/lib/apis';

export type ChapterFilter = ChapterRowFilter;

export type ChapterCounts = ChapterRowCountsResponse;

export const CHAPTER_PAGE_SIZE = 25;

const CHAPTER_FILTERS: readonly ChapterFilter[] = ['all', 'not_written', 'needs_review', 'draft', 'final'];

export function isChapterFilter(value: unknown): value is ChapterFilter {
  return CHAPTER_FILTERS.includes(value as ChapterFilter);
}

/** The page of the unfiltered list that holds `chapter`, given every planned or written chapter number in order. */
export function pageOfChapter(chapters: readonly number[], chapter: number): number {
  const index = [...chapters].sort((a, b) => a - b).indexOf(chapter);
  return index < 0 ? 1 : Math.floor(index / CHAPTER_PAGE_SIZE) + 1;
}

interface ChapterNumbered {
  chapter: number;
}

/** Every planned or written chapter number, ascending — the order the unfiltered list pages through. */
export function listedChapters(briefs: readonly ChapterNumbered[], drafts: readonly ChapterNumbered[]): number[] {
  return [...new Set([...briefs, ...drafts].map(item => item.chapter))].sort((a, b) => a - b);
}

/** The lowest brief with no draft yet — the only chapter `generate` will write next. */
export function nextBriefChapter(briefs: readonly ChapterNumbered[], drafts: readonly ChapterNumbered[]): number | undefined {
  const drafted = new Set(drafts.map(draft => draft.chapter));
  return listedChapters(briefs, []).find(chapter => !drafted.has(chapter));
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

export function chapterSummary(counts: ChapterCounts, totalWords: number): string {
  if (counts.all === 0) return 'No chapters planned or written yet';
  const written = counts.all - counts.not_written;
  const progress = counts.not_written === 0 ? `${plural(written, 'chapter')} written` : `${written.toLocaleString()} of ${plural(counts.all, 'chapter')} written`;
  return `${progress} · ${plural(totalWords, 'word')}`;
}

export type ChapterShow = 'all' | 'not_final' | 'final';

const CHAPTER_SHOWS: readonly ChapterShow[] = ['all', 'not_final', 'final'];

export function isChapterShow(value: unknown): value is ChapterShow {
  return CHAPTER_SHOWS.includes(value as ChapterShow);
}

export function showCounts(counts: ChapterCounts): Record<ChapterShow, number> {
  return { all: counts.all, not_final: counts.all - counts.final, final: counts.final };
}

interface ShowableRow {
  kind: ChapterRowKind;
  chapter: number;
  status?: DraftStatus;
}

/** `povChapters` comes from `/source/chapters?pov=`, which only knows finalized chapters — a draft or planned row never matches it. */
export function rowVisible(row: ShowableRow, show: ChapterShow, povChapters?: ReadonlySet<number>): boolean {
  if (povChapters && !povChapters.has(row.chapter)) return false;
  if (show === 'all') return true;
  const final = row.kind === 'written' && row.status === 'final';
  return show === 'final' ? final : !final;
}

export type ChapterVolume = Pick<VolumeResponse, 'volumeKey' | 'ordinal' | 'title' | 'objective' | 'state' | 'firstChapter' | 'lastChapter' | 'wordCount'>;

export interface ChapterGroup {
  key: string;
  /** 1-based position in volume order — what the author reads as "Volume N"; absent for the single list of a novel with no volumes. */
  number?: number;
  volume?: ChapterVolume;
  chapters: number[];
}

export const UNGROUPED_KEY = 'all';

function rangeOf(group: ChapterGroup): { first: number; last: number } {
  return { first: group.volume?.firstChapter ?? 0, last: group.volume?.lastChapter ?? 0 };
}

/**
 * A volume only knows its finalized chapters, so drafts and planned chapters past every volume's range join the volume being written:
 * the active one, else the last one with chapters, else the first. A chapter in a gap between ranges stays with the volume before it.
 */
export function groupChaptersByVolume(volumes: readonly ChapterVolume[], chapters: readonly number[]): ChapterGroup[] {
  const sorted = [...chapters].sort((a, b) => a - b);
  const groups: ChapterGroup[] = [...volumes].sort((a, b) => a.ordinal - b.ordinal).map((volume, index) => ({ key: volume.volumeKey, number: index + 1, volume, chapters: [] }));
  const [firstGroup] = groups;
  if (!firstGroup) return [{ key: UNGROUPED_KEY, chapters: sorted }];

  const ranged = groups.filter(group => group.volume?.firstChapter != null);
  const highest = Math.max(0, ...ranged.map(group => rangeOf(group).last));
  const writing = groups.find(group => group.volume?.state === 'active') ?? ranged.at(-1) ?? firstGroup;

  const descending = [...ranged].reverse();

  for (const chapter of sorted) {
    const inside = ranged.find(group => chapter >= rangeOf(group).first && chapter <= rangeOf(group).last);
    const before = descending.find(group => rangeOf(group).first <= chapter);
    const target = inside ?? (chapter > highest ? writing : (before ?? ranged[0] ?? writing));
    target.chapters.push(chapter);
  }
  return groups;
}

export function pageCountOf(group: Pick<ChapterGroup, 'chapters'>): number {
  return Math.max(1, Math.ceil(group.chapters.length / CHAPTER_PAGE_SIZE));
}

/** The volume being written, and a novel with no volumes, open on their newest page; a finished or unstarted volume opens at its start. */
export function opensOnNewestPage(group: Pick<ChapterGroup, 'volume'>): boolean {
  return !group.volume || group.volume.state === 'active';
}

export function currentPageOf(group: ChapterGroup, pages: Readonly<Record<string, number>> | undefined): number {
  const pageCount = pageCountOf(group);
  const requested = pages?.[group.key];
  if (requested) return Math.min(Math.max(1, requested), pageCount);
  return opensOnNewestPage(group) ? pageCount : 1;
}

export function chaptersOnPage(group: Pick<ChapterGroup, 'chapters'>, page: number): number[] {
  return group.chapters.slice((page - 1) * CHAPTER_PAGE_SIZE, page * CHAPTER_PAGE_SIZE);
}

function span(chapters: readonly number[]): string {
  const first = chapters[0];
  const last = chapters.at(-1);
  if (first === undefined || last === undefined) return '';
  return first === last ? `${first}` : `${first}–${last}`;
}

export interface GroupPage {
  page: number;
  label: string;
}

export function groupPages(group: Pick<ChapterGroup, 'chapters'>): GroupPage[] {
  return Array.from({ length: pageCountOf(group) }, (_, index) => ({ page: index + 1, label: `Ch ${span(chaptersOnPage(group, index + 1))}` }));
}

export function pageRangeLabel(group: ChapterGroup, page: number): string {
  const newest = opensOnNewestPage(group) ? ', newest page opens first' : '';
  return `Page ${page} of ${pageCountOf(group)} · chapters ${span(chaptersOnPage(group, page))} · ${CHAPTER_PAGE_SIZE} per page${newest}`;
}

export interface RowsWindow {
  offset: number;
  limit: number;
}

const ROWS_LIMIT_MAX = 100;

/** `/chapter-rows` pages the whole unfiltered list, so a volume's page is the stretch of it from that page's first chapter to its last. */
export function rowsWindow(allChapters: readonly number[], pageChapters: readonly number[]): RowsWindow | undefined {
  const first = pageChapters[0];
  const last = pageChapters.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const start = allChapters.indexOf(first);
  const end = allChapters.indexOf(last);
  if (start < 0 || end < start) return undefined;
  return { offset: start, limit: Math.min(ROWS_LIMIT_MAX, end - start + 1) };
}

const VOLUME_STATE_LABEL: Record<VolumeState, string> = { not_started: 'Not started', active: 'Active', goal_met: 'Goal met' };

export function volumeStateLabel(state: VolumeState): string {
  return VOLUME_STATE_LABEL[state];
}

export function volumeMeta(group: ChapterGroup): string {
  if (group.chapters.length === 0 || !group.volume) return '';
  const soFar = group.volume.state === 'active' ? ' so far' : '';
  return `Chapters ${span(group.chapters)}${soFar} · ${plural(group.volume.wordCount, 'word')}`;
}

export function volumesStarted(volumes: readonly Pick<VolumeResponse, 'state'>[]): string {
  if (volumes.length === 0) return '';
  const started = volumes.filter(volume => volume.state !== 'not_started').length;
  return `${started} of ${plural(volumes.length, 'volume')} started`;
}

/** Mirrors the server's pick for "goal met — start next": the first not-started volume after this one. */
export function nextVolumeGroup(groups: readonly ChapterGroup[], key: string): ChapterGroup | undefined {
  const index = groups.findIndex(group => group.key === key);
  if (index < 0) return undefined;
  return groups.slice(index + 1).find(group => group.volume?.state === 'not_started');
}

export function goalMetLabel(group: Pick<ChapterGroup, 'number'>, next: Pick<ChapterGroup, 'number'> | undefined): string {
  const done = `Volume ${group.number}’s goal is met`;
  return next ? `${done} — start volume ${next.number}` : done;
}

export type ChapterJump = { kind: 'found'; chapter: number; groupKey: string; page: number; message: string } | { kind: 'missing'; message: string };

export function jumpToChapter(groups: readonly ChapterGroup[], text: string, nextChapter: number): ChapterJump {
  const asked = text.trim();
  const chapter = Number(asked);
  const group = asked && Number.isInteger(chapter) ? groups.find(candidate => candidate.chapters.includes(chapter)) : undefined;
  if (!group) {
    const all = groups.flatMap(candidate => candidate.chapters).sort((a, b) => a - b);
    const book = all.length > 0 ? ` The book has chapters ${span(all)}; ${nextChapter} is next.` : ` Chapter ${nextChapter} is next.`;
    return { kind: 'missing', message: `There’s no chapter ${asked || '—'} yet.${book}` };
  }
  const page = Math.floor(group.chapters.indexOf(chapter) / CHAPTER_PAGE_SIZE) + 1;
  const where = group.number ? ` · volume ${group.number}` : '';
  return { kind: 'found', chapter, groupKey: group.key, page, message: `Chapter ${chapter}${where} — highlighted below.` };
}

export function chaptersSubtitle(counts: ChapterCounts, totalWords: number, volumes: readonly Pick<VolumeResponse, 'state'>[]): string {
  const locked = counts.final > 0 ? 'final chapters are locked — only you can amend them' : '';
  return [chapterSummary(counts, totalWords), volumesStarted(volumes), locked].filter(Boolean).join(' · ');
}

export function emptyVolumeNote(group: ChapterGroup, groups: readonly ChapterGroup[]): string {
  if (group.volume?.state === 'active') return 'No chapters yet — the next chapter you write starts this volume.';
  if (group.volume?.state === 'goal_met') return 'No chapters — this volume’s goal was met without any.';
  const previous = groups[groups.findIndex(candidate => candidate.key === group.key) - 1];
  return previous ? `No chapters yet — this volume starts when you move on from volume ${previous.number}.` : 'No chapters yet — this volume starts when you begin writing.';
}

/** Whether a group opens by default: a finished volume stays collapsed so the one being written is in view. */
export function opensByDefault(group: Pick<ChapterGroup, 'volume'>): boolean {
  return group.volume?.state !== 'goal_met';
}

/** Chapters on the page each open group shows — what the author can see without paging. */
export function visibleChapters(groups: readonly ChapterGroup[], isOpen: (group: ChapterGroup) => boolean, pages: Readonly<Record<string, number>> | undefined): Set<number> {
  return new Set(groups.filter(isOpen).flatMap(group => chaptersOnPage(group, currentPageOf(group, pages))));
}

/** The URL's volume pages with any past a volume's last page (deleted chapters, a stale link) pulled back to it; undefined when none overshoots. */
export function clampGroupPages(groups: readonly ChapterGroup[], pages: Readonly<Record<string, number>> | undefined): Record<string, number> | undefined {
  if (!pages) return undefined;
  const overshot = groups.filter(group => (pages[group.key] ?? 0) > pageCountOf(group));
  if (overshot.length === 0) return undefined;
  return { ...pages, ...Object.fromEntries(overshot.map(group => [group.key, pageCountOf(group)])) };
}

export function parseGroupPages(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, number] => Number.isInteger(entry[1]) && entry[1] > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
