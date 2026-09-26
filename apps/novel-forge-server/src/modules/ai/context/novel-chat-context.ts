import { firstUnwrittenChapter, PROGRESS_TOPIC_PREFIX, type ProgressItem } from '@server/common';
import { type Chapter, type Generation, type Knowledge, type Ledger, type Plan, type Project, type Story } from '@server/database';

import { AUTHOR_BRIEF_TOPIC } from '../../ledger/ledger-sections';
import { bibleDocLabel, bibleDocRef, type BibleDocRow, isPlannerOnlyBibleDoc } from './bible-docs';
import { computeDormantThreads } from './dormant-threads';
import { countTokens, truncateAtParagraph } from './token-budget';

export const NOVEL_CHAT_REQUEST_BUDGET = 24_000;
export const NOVEL_CHAT_PACK_FLOOR = 6_000;
export const NOVEL_CHAT_PACK_MARGIN = 64;
/** The author's message as the stable sections' budget assumes it; a longer one squeezes only the volatile sections. */
export const NOVEL_CHAT_MESSAGE_ALLOWANCE = 2_000;

export const NOVEL_CHAT_SECTION_CAPS = {
  story: 3_000,
  notebook: 2_500,
  authorNotes: 200,
  volumes: 1_000,
  promises: 1_500,
  inventory: 2_500,
  chapterIndex: 1_500,
  handoff: 3_500,
  changedSince: 600,
  progress: 500,
} as const;

const STORY_FIELD_CAPS = { premise: 1_200, field: 150, ending: 300, instructions: 400 } as const;
const INVENTORY_CAPS = { entities: 800, pages: 550, facts: 450, worldFacts: 350, milestones: 200 } as const;
const NOTEBOOK_LINE_SHARE = 3;
const CHAPTER_INDEX_COUNT = 40;
const LEFT_OUT_NOTE_TOKENS = 24;

const PLANNER_ONLY = 'PLANNER-ONLY — plan towards it, but never write it into a chapter plan before the one planned as the ending, a page the writer reads, or prose';
export const ENDING_PLANNER_ONLY_LABEL = `Ending (${PLANNER_ONLY})`;
export const ENDING_QUESTION_PLANNER_ONLY_LABEL = `Ending question (${PLANNER_ONLY})`;
export const LATER_VOLUME_GOAL_LABEL = 'Goal (PLANNER-ONLY — a later volume: keep it out of plans and pages for the chapters before it)';

export type NovelChatStory = Pick<
  Project.Row,
  'title' | 'premise' | 'brief' | 'themes' | 'theme' | 'endingQuestion' | 'ending' | 'readerPromise' | 'protagonistKey' | 'opposition'
> & { authorInstructions: string | null };

export type NovelChatLedgerEntry = Pick<Ledger.Entry, 'kind' | 'topic' | 'statement' | 'why' | 'rejectedAlternatives' | 'writerLine' | 'decidedBy'> &
  Partial<Pick<Ledger.Entry, 'ideaId' | 'rejectionScope'>>;
export type NovelChatVolume = Pick<Plan.Volume, 'volumeKey' | 'ordinal' | 'title' | 'objective' | 'state'>;
export type NovelChatThread = Pick<
  Story.PlotThread,
  'threadKey' | 'status' | 'summary' | 'openedChapter' | 'lastAdvancedChapter' | 'payoffWindow' | 'payoffMilestoneKey' | 'payoffVolumeKey' | 'intentionallyOpen'
>;
export type NovelChatMystery = Pick<
  Story.Mystery,
  'mysteryKey' | 'status' | 'question' | 'openedChapter' | 'lastAdvancedChapter' | 'payoffWindow' | 'payoffMilestoneKey' | 'payoffVolumeKey' | 'intentionallyOpen'
>;
export type NovelChatChapter = Pick<Chapter.Row, 'number' | 'title' | 'status' | 'summary' | 'isolated'>;
export type NovelChatDraft = Pick<Generation.Draft, 'chapter' | 'title' | 'reviewStatus' | 'summary' | 'isolated' | 'staleReason'>;
export type NovelChatBrief = Pick<
  Generation.Brief,
  | 'chapter'
  | 'title'
  | 'chapterPurpose'
  | 'direction'
  | 'body'
  | 'pov'
  | 'scenes'
  | 'endingContract'
  | 'claimedMilestones'
  | 'contentMode'
  | 'isEnding'
  | 'guidance'
  | 'revision'
  | 'staleReason'
  | 'writeMode'
>;

export interface NovelChatInventory {
  entities: Pick<Knowledge.Entity, 'entityKey' | 'name' | 'type' | 'significance'>[];
  pages: Pick<BibleDocRow, 'section' | 'slug' | 'frontmatter'>[];
  facts: Pick<Knowledge.CanonFact, 'factKey' | 'disclosedInChapter'>[];
  worldFacts: Pick<Story.WorldFact, 'category' | 'key'>[];
  milestones: Pick<Knowledge.Milestone, 'milestoneKey' | 'label' | 'state'>[];
}

function clipped(text: string, maxTokens: number): string {
  const { text: kept, truncated } = truncateAtParagraph(text, maxTokens);
  return truncated ? `${kept} […]` : kept;
}

function field(label: string, value: string | null | undefined, maxTokens: number = STORY_FIELD_CAPS.field): string | null {
  const text = value?.trim();
  return text ? `${label}: ${clipped(text, maxTokens)}` : null;
}

export function renderNovelStory(story: NovelChatStory): string {
  const themes = Array.isArray(story.themes) ? (story.themes as unknown[]).filter(theme => typeof theme === 'string').join(', ') : '';
  return [
    field('Working title', story.title),
    field('Premise', story.premise ?? story.brief, STORY_FIELD_CAPS.premise),
    field('What it is about underneath', story.theme),
    field('Themes', themes),
    field('What the reader is promised', story.readerPromise),
    field('Protagonist', story.protagonistKey),
    field('Opposition', story.opposition),
    field(ENDING_QUESTION_PLANNER_ONLY_LABEL, story.endingQuestion),
    field(ENDING_PLANNER_ONLY_LABEL, story.ending, STORY_FIELD_CAPS.ending) ?? `${ENDING_PLANNER_ONLY_LABEL}: undecided for now`,
    field('Author instructions', story.authorInstructions, STORY_FIELD_CAPS.instructions),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

interface LineGroup {
  heading: string;
  lines: string[];
}

/**
 * Earlier groups claim the budget first, and each is packed newest line first so a recent correction outlasts an older entry; kept lines
 * read in their original order. A line longer than its share of the budget is cut rather than left out whole.
 */
function fitGroups(groups: readonly LineGroup[], maxTokens: number, leftOut: string): string {
  let used = LEFT_OUT_NOTE_TOKENS;
  let omitted = 0;
  const lineCap = Math.floor(maxTokens / NOTEBOOK_LINE_SHARE);
  const rendered: string[] = [];
  for (const unclipped of groups) {
    const group = { ...unclipped, lines: unclipped.lines.map(line => clipped(line, lineCap)) };
    const kept = new Set<number>();
    const headingCost = countTokens(group.heading) + 2;
    for (let index = group.lines.length - 1; index >= 0; index--) {
      const cost = countTokens(group.lines[index] ?? '') + 1 + (kept.size === 0 ? headingCost : 0);
      if (used + cost > maxTokens) {
        omitted++;
        continue;
      }
      kept.add(index);
      used += cost;
    }
    if (kept.size > 0) rendered.push([group.heading, ...group.lines.filter((_, index) => kept.has(index))].join('\n'));
  }
  if (omitted > 0) rendered.push(`(+${omitted} more ${leftOut})`);
  return rendered.join('\n\n');
}

const DECIDED_KINDS: ReadonlySet<Ledger.Kind> = new Set(['decision', 'system']);

export const TURNED_DOWN_LIMIT = 10;
const TURNED_DOWN_CHARS = 160;
const TURNED_DOWN_SCOPE: Record<Ledger.RejectionScope, string> = {
  never: 'never',
  not_now: 'not during this volume',
  not_this_version: 'not while what it changes stays as it is',
};

function isTurnedDownIdea(entry: NovelChatLedgerEntry): boolean {
  return entry.kind === 'rejected' && Boolean(entry.ideaId) && Boolean(entry.rejectionScope);
}

/** Only the most recent, each cut short and without the author's reason: enough to steer away from close variants, never a transcript. */
function turnedDownGroup(entries: readonly NovelChatLedgerEntry[]): LineGroup {
  const ideas = entries.filter(isTurnedDownIdea);
  const recent = ideas.slice(-TURNED_DOWN_LIMIT);
  const shown = recent.length < ideas.length ? ` (the ${recent.length} most recent of ${ideas.length})` : '';
  const lines = recent.map(entry => {
    const statement = entry.statement.replace(/\s+/g, ' ').trim();
    const cut = statement.length > TURNED_DOWN_CHARS ? `${statement.slice(0, TURNED_DOWN_CHARS - 1)}…` : statement;
    return `- ${cut} (${TURNED_DOWN_SCOPE[entry.rejectionScope as Ledger.RejectionScope]})`;
  });
  return { heading: `### Suggestions the author turned down — do not offer them again, nor close variants${shown}`, lines };
}

function decisionLine(entry: NovelChatLedgerEntry): string {
  const why = entry.why ? ` — why: ${entry.why}` : '';
  const forWriter = entry.writerLine ? ` — for the writer: ${entry.writerLine}` : '';
  return `- ${entry.topic}: ${entry.statement}${why}${forWriter}`;
}

function directionLine(entry: NovelChatLedgerEntry): string {
  return `- [${entry.topic}] ${entry.statement}${entry.why ? ` — ${entry.why}` : ''}`;
}

function isAuthorsOwn(entry: NovelChatLedgerEntry): boolean {
  return entry.kind === 'direction' || (DECIDED_KINDS.has(entry.kind) && entry.decidedBy === 'author');
}

/** The author's decisions and directions claim the budget first, then what never to propose and the turned-down suggestions, then what the system decided, then the backlog. */
export function renderNotebook(all: readonly NovelChatLedgerEntry[], maxTokens: number = NOVEL_CHAT_SECTION_CAPS.notebook): string {
  const entries = all.filter(entry => entry.topic !== AUTHOR_BRIEF_TOPIC && !entry.topic.startsWith(PROGRESS_TOPIC_PREFIX));
  if (entries.length === 0) return 'Nothing has been decided yet.';
  const decided = entries.filter(entry => DECIDED_KINDS.has(entry.kind));
  const groups: LineGroup[] = [
    {
      heading: "### The author's decisions and directions",
      lines: entries.filter(isAuthorsOwn).map(entry => (entry.kind === 'direction' ? directionLine(entry) : decisionLine(entry))),
    },
    {
      heading: '### Do not propose',
      lines: [
        ...entries
          .filter(entry => entry.kind === 'rejected' && !isTurnedDownIdea(entry))
          .map(entry => `- ${entry.statement}${entry.why ? ` (the author's reason: ${entry.why})` : ''}`),
        ...decided.flatMap(entry => entry.rejectedAlternatives.map(alternative => `- ${alternative} (passed over for ${entry.topic})`)),
      ],
    },
    turnedDownGroup(entries),
    { heading: '### Decided by the system', lines: decided.filter(entry => entry.decidedBy === 'system').map(decisionLine) },
    { heading: '### Backlog — not yet', lines: entries.filter(entry => entry.kind === 'backlog').map(directionLine) },
  ];
  const nonEmpty = groups.filter(group => group.lines.length > 0);
  return fitGroups(nonEmpty, maxTokens, 'Notebook entries left out: the oldest in each group');
}

export function notesParagraphs(notes: string): string[] {
  return notes
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function renderNotesPointer(notes: string): string | null {
  const paragraphs = notesParagraphs(notes);
  if (paragraphs.length === 0) return null;
  const words = paragraphs.reduce((sum, paragraph) => sum + paragraph.split(/\s+/).length, 0);
  return `The author's own notes: ${paragraphs.length} paragraphs, about ${words} words. They are the author's words and outrank every summary; read them with get_notes before quoting, organising or critiquing them.`;
}

export function renderProgress(items: readonly ProgressItem[], chapterOneWritten: boolean): string | null {
  const open = items.filter(item => item.status === 'open');
  if (open.length === 0) return null;
  const heading = chapterOneWritten ? 'Story basics still open' : 'Ready for chapter 1';
  return `${heading} — advice only, never a reason to refuse planning or writing:\n${open.map(item => `- ${item.label}: ${item.why}`).join('\n')}`;
}

const VOLUME_STATE_LABELS: Record<Plan.Volume['state'], string> = { not_started: 'not started', active: 'active', goal_met: 'goal met' };

/** The current volume is the active one, else the first whose goal is not met. */
export function renderVolumeGoals(volumes: readonly NovelChatVolume[]): string {
  const ordered = [...volumes].sort((left, right) => left.ordinal - right.ordinal);
  const current = ordered.find(volume => volume.state === 'active') ?? ordered.find(volume => volume.state !== 'goal_met');
  return ordered
    .map(volume => {
      const label = current && volume.ordinal > current.ordinal ? LATER_VOLUME_GOAL_LABEL : 'Goal';
      return `Vol ${volume.ordinal} ${volume.volumeKey} (${VOLUME_STATE_LABELS[volume.state]}) — ${volume.title ?? 'untitled'}. ${label}: ${volume.objective?.trim() || 'not set yet'}`;
    })
    .join('\n');
}

type PromiseStanding = 'due' | 'dormant' | 'open' | 'dormant on purpose';

const STANDING_ORDER: readonly PromiseStanding[] = ['due', 'dormant', 'open', 'dormant on purpose'];

interface PromiseLine {
  standing: PromiseStanding;
  line: string;
}

/** What a promise pays off by, for display — a milestone or volume key outranks a chapter window; none of the three means "someday". */
export function payoffLabel(payoffWindow: number | null, payoffMilestoneKey: string | null, payoffVolumeKey: string | null): string {
  if (payoffMilestoneKey) return `milestone ${payoffMilestoneKey}`;
  if (payoffVolumeKey) return `volume ${payoffVolumeKey}`;
  if (payoffWindow !== null) return `ch ${payoffWindow}`;
  return 'someday';
}

function promiseLine(
  ref: string,
  label: string,
  opened: number | null,
  moved: number | null,
  payoffWindow: number | null,
  payoffMilestoneKey: string | null,
  payoffVolumeKey: string | null,
  standing: PromiseStanding,
): PromiseLine {
  const facts = [
    `opened ch ${opened ?? '?'}`,
    moved !== null ? `last moved ch ${moved}` : null,
    `pays off: ${payoffLabel(payoffWindow, payoffMilestoneKey, payoffVolumeKey)}`,
  ].join(', ');
  return { standing, line: `${ref} [${standing}] — ${label} (${facts})` };
}

/**
 * A promise stands "due" once an authored chapter window is reached, its payoff milestone is reached, or its payoff volume is active or
 * has already met its goal (P4-41b) — the same due-ness the obligations selector (`chapter-plan.ts`) uses for the recap, though this coarser
 * inventory does not distinguish due from overdue the way the recap's wording does.
 */
export function renderPromises(
  threads: readonly NovelChatThread[],
  mysteries: readonly NovelChatMystery[],
  nextChapter: number,
  milestoneStates?: ReadonlyMap<string, Knowledge.MilestoneState>,
  volumeStates?: ReadonlyMap<string, Plan.VolumeState>,
): string {
  const dormant = new Set(
    computeDormantThreads(threads, mysteries, Math.max(nextChapter - 1, 0))
      .filter(entry => entry.reason === 'dormant')
      .map(entry => `${entry.kind}:${entry.key}`),
  );
  const standing = (ref: string, payoffWindow: number | null, payoffMilestoneKey: string | null, payoffVolumeKey: string | null, onPurpose: boolean): PromiseStanding => {
    if (onPurpose) return 'dormant on purpose';
    const dueByChapter = payoffWindow !== null && payoffWindow <= nextChapter;
    const dueByMilestone = payoffMilestoneKey !== null && milestoneStates?.get(payoffMilestoneKey) === 'reached';
    const volumeState = payoffVolumeKey !== null ? volumeStates?.get(payoffVolumeKey) : undefined;
    const dueByVolume = volumeState === 'active' || volumeState === 'goal_met';
    if (dueByChapter || dueByMilestone || dueByVolume) return 'due';
    return dormant.has(ref) ? 'dormant' : 'open';
  };
  const lines = [
    ...threads
      .filter(thread => thread.status === 'open')
      .map(thread => {
        const ref = `thread:${thread.threadKey}`;
        const label = thread.summary?.trim() || thread.threadKey;
        return promiseLine(
          ref,
          label,
          thread.openedChapter,
          thread.lastAdvancedChapter,
          thread.payoffWindow,
          thread.payoffMilestoneKey,
          thread.payoffVolumeKey,
          standing(ref, thread.payoffWindow, thread.payoffMilestoneKey, thread.payoffVolumeKey, thread.intentionallyOpen),
        );
      }),
    ...mysteries
      .filter(mystery => mystery.status === 'open')
      .map(mystery => {
        const ref = `mystery:${mystery.mysteryKey}`;
        return promiseLine(
          ref,
          mystery.question,
          mystery.openedChapter,
          mystery.lastAdvancedChapter,
          mystery.payoffWindow,
          mystery.payoffMilestoneKey,
          mystery.payoffVolumeKey,
          standing(ref, mystery.payoffWindow, mystery.payoffMilestoneKey, mystery.payoffVolumeKey, mystery.intentionallyOpen),
        );
      }),
  ];
  const ordered = STANDING_ORDER.flatMap(order => lines.filter(line => line.standing === order).map(line => line.line));
  return fitLines(ordered, NOVEL_CHAT_SECTION_CAPS.promises, 'open promises — get_plot_threads lists them all');
}

export function fitLines(lines: readonly string[], maxTokens: number, leftOut: string): string {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = countTokens(line) + 1;
    if (used + cost > maxTokens - LEFT_OUT_NOTE_TOKENS) break;
    kept.push(line);
    used += cost;
  }
  const omitted = lines.length - kept.length;
  return omitted > 0 ? [...kept, `(+${omitted} more ${leftOut})`].join('\n') : kept.join('\n');
}

function inventoryPart(header: string, lines: string[], maxTokens: number, leftOut: string): string | null {
  return lines.length === 0 ? null : `${header}\n${fitLines(lines, maxTokens, leftOut)}`;
}

function byText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const PLANNER_ONLY_PAGE_NOTE = '(planner-only: says what happens later in the book — look it up to read it; a change drawn from it waits for the author’s review)';

export function renderInventory(inventory: NovelChatInventory): string {
  const entities = [...inventory.entities]
    .sort((left, right) => Number(left.significance !== 'major') - Number(right.significance !== 'major') || byText(left.entityKey, right.entityKey))
    .map(entity => `${entity.entityKey} — ${entity.name} (${entity.type}${entity.significance === 'major' ? ', major' : ''})`);
  const pages = inventory.pages.map(page => {
    const ref = bibleDocRef(page);
    if (isPlannerOnlyBibleDoc(page)) return `${ref} ${PLANNER_ONLY_PAGE_NOTE}`;
    return `${ref} — ${bibleDocLabel({ ...page, body: null })}`;
  });
  const facts = [...inventory.facts]
    .sort((left, right) => byText(left.factKey, right.factKey))
    .map(fact => `${fact.factKey}${fact.disclosedInChapter !== null ? ` (reader knows since ch ${fact.disclosedInChapter})` : ' (secret)'}`);
  const worldFacts = [...groupBy(inventory.worldFacts, fact => fact.category)].map(([category, keys]) => `${category}: ${keys.map(fact => fact.key).join(' | ')}`);
  const milestones = inventory.milestones.map(milestone => `${milestone.milestoneKey} — ${milestone.label} (${milestone.state})`);
  return [
    inventoryPart('Characters, places and other entities (get_entity):', entities, INVENTORY_CAPS.entities, 'entities — search_lore finds them'),
    inventoryPart('Story Bible pages (get_bible_document):', pages, INVENTORY_CAPS.pages, 'pages — search_lore finds them'),
    inventoryPart('Canon facts and secrets by key (get_canon_facts):', facts, INVENTORY_CAPS.facts, 'facts — search_lore finds them'),
    inventoryPart('World facts by category (get_world_facts):', worldFacts, INVENTORY_CAPS.worldFacts, 'categories — get_world_facts lists them'),
    inventoryPart('Milestones:', milestones, INVENTORY_CAPS.milestones, 'milestones — search_lore finds them'),
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n');
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

type ChapterStanding = 'final' | 'approved' | 'ready to read' | 'changed — needs a look' | 'being written' | 'failed' | 'skipped';

const DRAFT_STANDING: Record<Generation.Draft['reviewStatus'], ChapterStanding> = {
  generating: 'being written',
  needs_review: 'ready to read',
  contradiction: 'changed — needs a look',
  approved: 'approved',
  final: 'final',
};

interface IndexedChapter {
  number: number;
  title: string | null;
  standing: ChapterStanding;
  isolated: boolean;
  summary: string | null;
}

function indexChapters(chapters: readonly NovelChatChapter[], drafts: readonly NovelChatDraft[]): IndexedChapter[] {
  const byNumber = new Map<number, IndexedChapter>();
  for (const draft of drafts) {
    byNumber.set(draft.chapter, { number: draft.chapter, title: draft.title, standing: DRAFT_STANDING[draft.reviewStatus], isolated: draft.isolated, summary: draft.summary });
  }
  for (const chapter of chapters) {
    const standing: ChapterStanding = chapter.status === 'done' ? 'final' : chapter.status;
    const draft = byNumber.get(chapter.number);
    byNumber.set(chapter.number, {
      number: chapter.number,
      title: chapter.title ?? draft?.title ?? null,
      standing,
      isolated: chapter.isolated,
      summary: chapter.summary || draft?.summary || null,
    });
  }
  return [...byNumber.values()].sort((left, right) => left.number - right.number);
}

/** A final import counts as written. */
export function nextChapterNumber(chapters: readonly NovelChatChapter[], drafts: readonly Pick<NovelChatDraft, 'chapter'>[]): number {
  const finalized = chapters.filter(chapter => chapter.status === 'done').map(chapter => chapter.number);
  return firstUnwrittenChapter(new Set(drafts.map(draft => draft.chapter)), new Set(finalized));
}

export function renderChapterIndex(chapters: readonly NovelChatChapter[], drafts: readonly NovelChatDraft[], plannedChapters: readonly number[]): string | null {
  const indexed = indexChapters(chapters, drafts);
  if (indexed.length === 0 && plannedChapters.length === 0) return null;
  const count = (standing: ChapterStanding): number => indexed.filter(chapter => chapter.standing === standing).length;
  const written = new Set(indexed.map(chapter => chapter.number));
  const planned = plannedChapters.filter(chapter => !written.has(chapter)).length;
  const counts = `${indexed.length} chapters written: ${count('final')} final, ${count('approved')} approved, ${count('ready to read')} ready to read; ${planned} planned but not written.`;
  const shown = indexed.slice(-CHAPTER_INDEX_COUNT);
  const earlier = indexed.length - shown.length;
  const lines = shown.map(chapter => `${chapter.number} — ${chapter.title ?? `Chapter ${chapter.number}`} [${chapter.standing}${chapter.isolated ? ', unrestricted' : ''}]`);
  const leftOut = earlier > 0 ? [`(${earlier} earlier chapters left out — get_chapter_summaries reads them)`] : [];
  return [counts, ...leftOut, ...lines].join('\n');
}

function renderEndingContract(contract: unknown): string | null {
  if (!contract || typeof contract !== 'object') return null;
  const { hookType, emotionalBeat, openQuestion, handoffState } = contract as Record<string, unknown>;
  const parts = [
    typeof hookType === 'string' ? `hook: ${hookType}` : null,
    typeof emotionalBeat === 'string' ? `feeling: ${emotionalBeat}` : null,
    typeof openQuestion === 'string' ? `leaves open: ${openQuestion}` : null,
    typeof handoffState === 'string' ? `hands off: ${handoffState}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : null;
}

function planLine(label: string, value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? `${label}: ${text}` : null;
}

function renderPlan(brief: NovelChatBrief): string {
  const scenes = (brief.scenes ?? []).map((scene, index) => `  ${index + 1}. ${scene.summary}${scene.pov ? ` (POV ${scene.pov})` : ''}`);
  const milestones = brief.claimedMilestones ?? [];
  return [
    `Plan for chapter ${brief.chapter} (rev ${brief.revision}${brief.writeMode === 'external' ? ', the author writes it' : ''}): ${brief.title ?? 'untitled'}`,
    planLine('What it does', brief.chapterPurpose),
    planLine('Agreed direction', brief.direction),
    planLine('POV', brief.pov),
    brief.body.trim(),
    scenes.length > 0 ? `Scenes:\n${scenes.join('\n')}` : null,
    planLine('Ends on', renderEndingContract(brief.endingContract)),
    milestones.length > 0 ? `This chapter reaches: ${milestones.join(', ')}` : null,
    planLine('Content for this chapter', brief.contentMode),
    brief.isEnding ? 'This is the chapter planned as the ending.' : null,
    planLine('Author guidance', brief.guidance),
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function nextStatus(next: number, brief: NovelChatBrief | undefined): string {
  if (!brief) return `Next chapter: ${next} — no plan yet.`;
  if (brief.staleReason) return `Next chapter: ${next} — its plan is stale (${brief.staleReason}); replan or confirm it before writing.`;
  return `Next chapter: ${next} — planned, not written yet.`;
}

export function renderHandoff(chapters: readonly NovelChatChapter[], drafts: readonly NovelChatDraft[], briefs: readonly NovelChatBrief[]): string {
  const next = nextChapterNumber(chapters, drafts);
  const latest = indexChapters(chapters, drafts)
    .filter(chapter => chapter.number < next)
    .at(-1);
  const briefFor = (chapter: number): NovelChatBrief | undefined => briefs.find(brief => brief.chapter === chapter);
  const latestLines = latest
    ? [
        `Latest chapter: ${latest.number} — ${latest.title ?? 'untitled'} [${latest.standing}]`,
        latest.summary ? `AI summary of chapter ${latest.number} (the author's words above outrank it): ${latest.summary.trim()}` : null,
        planLine('It ends on', renderEndingContract(briefFor(latest.number)?.endingContract)),
      ]
    : ['Nothing is written yet.'];
  const nextBrief = briefFor(next);
  return [...latestLines, nextStatus(next, nextBrief), nextBrief ? renderPlan(nextBrief) : null].filter((line): line is string => Boolean(line)).join('\n');
}
