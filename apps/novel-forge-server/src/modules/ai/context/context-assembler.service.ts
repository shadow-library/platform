import { createHash } from 'node:crypto';

import { and, between, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { computeProgress, isOpenCanon, nearestVolumeKey, type PlanOverlay, progressFieldsFrom, progressOverridesFrom } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ledger, type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import {
  type FactLike,
  loadKnowledgeView,
  loadWriterHiddenFactKeys,
  parseKnowledgeContract,
  renderChapterReveals,
  renderHiddenConstraints,
  renderKnownFacts,
  renderReaderKnows,
  withWriterNotes,
} from '../../bible/fact/knowledge-view';
import { loadWriterDisclosurePolicy, WriterDisclosurePolicy, type WriterField } from '../../bible/fact/writer-disclosure-policy';
import { bridgedSummary, type BridgeLoader, bridgeLoader, type BridgeSubject, type IsolationBridge, loadIsolationBridges } from '../../finalize-review/isolation-bridge';
import { loadActiveLedger } from '../../ledger/ledger-entries';
import { AUTHOR_BRIEF_TOPIC, writerLinesSection } from '../../ledger/ledger-sections';
import { type ForgeCallPolicy } from '../../plugins/plugin-policy.service';
import { withoutLapsedRejections } from '../../refinement/idea-rejections';
import { hardLineError, screenTexts, sectionScreens } from '../hard-line';
import { NO_APPROVED_BRIDGE, NO_BRIDGE_SUMMARY, standardReadableState } from '../isolation-read-policy';
import { effectiveWritingInstructions, writingInstructionAdditions } from '../prompts/writing-instructions';
import { type RetrievalHit, RetrievalService } from '../retrieval';
import { renderEventsAsOf } from './art-context';
import { isWriterExcludedBibleDoc } from './bible-docs';
import { type ChapterSpan } from './canon-guard';
import { type CatalogOptions, CatalogService } from './catalog.service';
import {
  nextChapterNumber,
  NOVEL_CHAT_MESSAGE_ALLOWANCE,
  NOVEL_CHAT_PACK_FLOOR,
  NOVEL_CHAT_PACK_MARGIN,
  NOVEL_CHAT_REQUEST_BUDGET,
  NOVEL_CHAT_SECTION_CAPS,
  renderChapterIndex,
  renderHandoff,
  renderInventory,
  renderNotebook,
  renderNotesPointer,
  renderNovelStory,
  renderProgress,
  renderPromises,
  renderVolumeGoals,
} from './novel-chat-context';
import { pluginContextSections } from './plugin-sections';
import {
  type AssembledPack,
  type ContextPurpose,
  type ContextSection,
  type ContextSegment,
  type ContextTier,
  joinSections,
  type OmittedSection,
  renderLabeledSection,
  renderSection,
  splitSegments,
} from './sections';
import { applyBudget, countTokens, truncateAtParagraph, truncateAtParagraphTail } from './token-budget';
import { loadWriterBrief } from './writer-brief';
import { assertWriterContextFits, renderCompletedVolumes, WRITER_OPTIONAL_PRIORITY, WRITER_SECTION_CAPS, type WriterReservation } from './writer-context';

export interface PackPolicyOptions {
  /** The policy of the roles that will read this pack, resolved ahead of assembly so the writer class is already fixed when sections are chosen. */
  policy?: ForgeCallPolicy;
}

export interface IllustrationPackOptions extends PackPolicyOptions {
  /** The art disclosure policy of the chapter the image is drawn as of: an entity's depicted chapter, a chapter subject's own, or the latest final one for a cover. */
  depiction?: WriterDisclosurePolicy;
}

export interface PackOptions extends PackPolicyOptions {
  budgetTokens?: number;
}

export interface OutlinePackOptions extends PackOptions {
  /** The chapters the outline call plans; without it the reveal schedule covers the chapter alone. */
  span?: ChapterSpan;
  /** Planning a chapter to be inserted after this one: reveal chapters are rendered as they will read once it commits. */
  insertAfter?: number;
  /** The volume the planned chapter belongs to, when the caller has already resolved it; otherwise the nearest plan decides. */
  volumeKey?: string | null;
}

export interface ChapterPackOptions extends PackOptions {
  dryRun?: boolean;
  /** The run's disclosure policy, so the pack and the brief the writer reads beside it are scrubbed against one snapshot. */
  disclosure?: WriterDisclosurePolicy;
  /**
   * Fails with CTX_002 when the writer's required material is over its limits or the budget. Only the calls that write or revise the
   * chapter enforce it; readers of the pack (judge, review, previews) take it with its omissions.
   */
  enforceWriterReservations?: boolean;
}

interface ResolvedRefs {
  resolved: ContextSection[];
  unresolved: string[];
  /** Refs the chapter's disclosure policy refused on purpose — later volumes, chapters, threads and mysteries, excluded pages. */
  withheld: string[];
  /** The resolved `entity:` refs whose entity is a character. */
  characters: string[];
  /** The resolved `fact:` refs the writer reads as a writing constraint: a locked secret's cover note in place of its truth. */
  constraints: string[];
}

export interface WriterRefs {
  /** The refs the plan cites that resolve to a section the writer may read, in the plan's order — before any budget cut the pack makes. */
  included: string[];
  unresolved: string[];
  withheld: string[];
  constraints: string[];
}

interface ChapterRefSource {
  contextRefs?: unknown;
  pov?: string | null;
  knowledgeContract?: unknown;
}

/** The refs a chapter's writer pack resolves: the plan's own, then the point-of-view cast's cards the plan does not already cite. */
export function chapterWriterRefs(plan: ChapterRefSource | null | undefined): string[] {
  const contextRefs = Array.isArray(plan?.contextRefs) ? (plan.contextRefs as string[]) : [];
  const pov = plan?.pov ?? null;
  const castRefs = [...new Set(parseKnowledgeContract(plan?.knowledgeContract)?.pov ?? [])].filter(key => key !== pov).map(key => `entity:${key}`);
  return [...contextRefs, ...castRefs.filter(ref => !contextRefs.includes(ref))];
}

export interface NovelChatPackOptions extends PackPolicyOptions {
  /** The system prompt and playbook: the same every turn, so the stable sections' budget stays put. */
  promptTokens: number;
  /** What the turn adds on top: turn rules, history and the author's message. */
  requestTokens: number;
}

export const DEFAULT_BUDGET = 24_000;
export const PREV_ENDING_TAIL = 500;
export const FULL_CAST_MAX = 5;
const RECENT_SUMMARY_COUNT = 3;
const RECENT_SUMMARY_MAX = 400;
const ESTABLISHED_FACTS_MAX = 15;
// A stale draft is labelled, not dropped: an ancestor changed under it, but it is still the only continuity the next writer has.
const STALE_LABEL = '[STALE — may not match the current plan]';

// History is prompt messages, not pack text; its budgets are enforced by ChatService compaction.
export const CHAT_HISTORY_BUDGET = 6_000;
export const CHAT_SUMMARY_BUDGET = 1_500;
export const NOVEL_CHAT_HISTORY_ALLOWANCE = CHAT_HISTORY_BUDGET + CHAT_SUMMARY_BUDGET + NOVEL_CHAT_MESSAGE_ALLOWANCE;
// A planning pack carries the whole catalog — every canon fact and a description per entity.
export const OUTLINE_BUDGET = 32_000;
// Token counts of a section's parts and of the rendered whole differ by a few tokens; the margin keeps a sized section inside the budget.
const SIZED_SECTION_MARGIN = 32;
export const PREMISE_BUDGET = 8_000;
export const AUDIT_BUDGET = 12_000;
// An image prompt is a paragraph: the composer needs the subject, the look, and nothing else.
export const ILLUSTRATION_BUDGET = 6_000;
export const ILLUSTRATION_WORLD_FACTS_MAX = 30;

// The project's art direction lives in one conventional bible document; every illustration prompt is
// bound by it when it exists. Authors create it like any other bible doc — no bespoke table.
export const ART_STYLE_DOC = { section: 'project', slug: 'art-style' } as const;

function makeSection(key: string, content: string, tier: ContextTier, sourceRefs: string[] = [], segment: ContextSegment = 'volatile'): ContextSection {
  const rendered = renderSection(key, content);
  const tokens = countTokens(rendered);
  return { key, tier, segment, tokens, truncated: false, sourceRefs, rendered };
}

// Tail variant — keeps the END of `content` (used for prev_ending: the model must see how the
// previous chapter actually stopped, not how it started).
function makeSectionTail(key: string, content: string, maxTokens: number, tier: ContextTier, sourceRefs: string[] = []): ContextSection {
  const { text, truncated } = truncateAtParagraphTail(content, maxTokens);
  const rendered = renderSection(key, text);
  const tokens = countTokens(rendered);
  return { key, tier, segment: 'volatile', tokens, truncated, sourceRefs, rendered };
}

interface SubjectRecord {
  name: string;
  status: string | null;
  appearance: string | null;
  body: string | null;
  notes: string | null;
  motivation: string | null;
}

function presentSubjectCard(entity: SubjectRecord, heading: string, aliases: string): string[] {
  return [
    heading,
    aliases,
    entity.status ? `Status: ${entity.status}` : '',
    entity.appearance ? `Canonical appearance: ${entity.appearance}` : 'Canonical appearance: none recorded — derive one.',
    entity.body ?? '',
    entity.notes ?? '',
    entity.motivation ? `Motivation: ${entity.motivation}` : '',
  ];
}

// The entity row is its present-day record, so a draw at an earlier chapter reads it as a baseline the timeline corrects; the author's
// working notes and the present-day status are left out, since neither is a description of the entity at that chapter.
function datedSubjectCard(entity: SubjectRecord, heading: string, aliases: string, chapter: number): string[] {
  return [
    heading,
    `Draw ${entity.name} as of chapter ${chapter}. The current record below may describe later chapters; where the changes up to chapter ${chapter} differ from it, they win.`,
    aliases,
    entity.appearance ? `Current record (may describe later chapters) — appearance: ${entity.appearance}` : `Appearance: none recorded — derive one as of chapter ${chapter}.`,
    entity.body ? `Current record (may describe later chapters) — profile: ${entity.body}` : '',
    entity.motivation ? `Current record (may describe later chapters) — motivation: ${entity.motivation}` : '',
  ];
}

function asStable(section: ContextSection): ContextSection {
  return { ...section, segment: 'stable' };
}

/** The finished section cut at its paragraphs to `cap` tokens, heading included, when it is longer — whatever made it long. */
function fitToCap(section: ContextSection, cap: number): ContextSection {
  if (section.tokens <= cap) return section;
  const split = section.rendered.indexOf('\n\n');
  const heading = split === -1 ? '' : section.rendered.slice(0, split + 2);
  const body = split === -1 ? section.rendered : section.rendered.slice(split + 2);
  const room = Math.max(0, cap - countTokens(heading) - SIZED_SECTION_MARGIN);
  const rendered = `${heading}${truncateAtParagraph(body, room).text}`;
  return { ...section, rendered, tokens: countTokens(rendered), truncated: true };
}

interface FactCut {
  kept: FactLike[];
  omitted: OmittedSection[];
}

/** Keeps facts in the order given while their lines fit `maxTokens`; each one left out is recorded with the size of its line. */
function fitFacts(facts: readonly FactLike[], line: (fact: FactLike) => string, maxTokens: number): FactCut {
  const kept: FactLike[] = [];
  const omitted: OmittedSection[] = [];
  let used = 0;
  for (const fact of facts) {
    const tokens = countTokens(line(fact)) + 1;
    if (used + tokens <= maxTokens || kept.length === 0) {
      kept.push(fact);
      used += tokens;
    } else {
      omitted.push({ key: `fact:${fact.factKey}`, reason: 'budget', tokens });
    }
  }
  return { kept, omitted };
}

/** The chapter's own facts first — those about its cast — then the rest in the order given. */
function subjectsFirst(facts: readonly FactLike[], castKeys: ReadonlySet<string>): FactLike[] {
  const about = (fact: FactLike): boolean => (fact.subjects ?? []).some(subject => castKeys.has(subject));
  return [...facts.filter(about), ...facts.filter(fact => !about(fact))];
}

/** What a section is about, from its heading: the name after `## LABEL:`, or the whole heading. */
function sectionSubject(section: Pick<ContextSection, 'rendered'>): string {
  const heading = (section.rendered.split('\n', 1)[0] ?? '').replace(/^#+\s*/, '');
  const colon = heading.indexOf(':');
  return colon === -1 ? heading : heading.slice(colon + 1).trim();
}

export const ENTITY_CARD_BUDGET = 800;
// Room for the card's own heading, name, alias and status lines inside the POV card's limit.
const POV_CARD_BODY_MAX = WRITER_SECTION_CAPS.povCard - 200;
// The "earlier volumes not shown" line the completed-volume summary may add after it is sized.
const COMPLETED_VOLUMES_NOTE_MARGIN = 20;
// Writing style is reserved ahead of every other section, so an oversized instructions text must not be
// able to claim the budget the rest of the pack needs.
export const WRITING_STYLE_BUDGET = 4_000;

function writingStyleSection(stored: string | null | undefined, disclosure: WriterDisclosurePolicy): ContextSection {
  const additions = writingInstructionAdditions(stored);
  const { text, truncated } = effectiveWritingInstructions(additions && disclosure.scrub(additions, 'style'), WRITING_STYLE_BUDGET);
  return { ...makeSection('writing_style', text, 'canonical'), truncated };
}

const ALLOWED_CLUES_LEAD = 'Signs you may show while their cause stays unexplained:';

/** Allowed clues are the author's licence to foreshadow, so they reach the writer unscrubbed. */
function allowedCluesSection(disclosure: WriterDisclosurePolicy): ContextSection | null {
  const clues = disclosure.allowedClues();
  if (clues.length === 0) return null;
  return makeSection('allowed_clues', [ALLOWED_CLUES_LEAD, ...clues.map(clue => `- ${clue}`)].join('\n'), 'approved_intent');
}

type EntityCardRow = Pick<typeof schema.entities.$inferSelect, 'name' | 'type' | 'status' | 'body' | 'notes'> & { aliases: { alias: string }[] };

interface RenderedCard {
  text: string;
  truncated: boolean;
}

const HEADING_LINE = /^(#{1,6}\s+(?<md>.+)|\*\*(?<bold>[^*\n]+)\*\*:?|__(?<under>[^_\n]+)__:?)\s*$/;
const INLINE_LABEL = /^(?:\*\*|__)?(?<label>[^*_:\n]{1,40}?)(?:\*\*|__)?:/;
const GUIDANCE_WORDS = /\b(drafter|drafting|cautions?|prohibit\w*|avoid|warnings?|guidance|off[- ]limits)\b/i;
const PROHIBITION_OPENER = /^(?:\*\*|__)?(never|do not|don't|must not)\b/i;

interface CardBlock {
  paragraphs: string[];
  guidance: boolean;
  heading: boolean;
}

function headingText(paragraph: string): string | null {
  const groups = HEADING_LINE.exec(paragraph.split('\n', 1)[0] ?? '')?.groups;
  return groups ? (groups.md ?? groups.bold ?? groups.under ?? '') : null;
}

function isGuidanceParagraph(paragraph: string): boolean {
  const label = INLINE_LABEL.exec(paragraph)?.groups?.label;
  return (label !== undefined && GUIDANCE_WORDS.test(label)) || PROHIBITION_OPENER.test(paragraph.trimStart());
}

// Authored cards tend to end on the drafter guidance and the prohibitions, which a tail cut removes
// first; an over-budget card therefore leads with those blocks, in their authored order.
function guidanceFirst(body: string): string {
  const blocks: CardBlock[] = [];
  for (const paragraph of body.split(/\n\n+/)) {
    const heading = headingText(paragraph);
    const current = blocks.at(-1);
    if (heading !== null) blocks.push({ paragraphs: [paragraph], guidance: GUIDANCE_WORDS.test(heading), heading: true });
    else if (current?.heading) current.paragraphs.push(paragraph);
    else blocks.push({ paragraphs: [paragraph], guidance: isGuidanceParagraph(paragraph), heading: false });
  }
  return [...blocks.filter(b => b.guidance), ...blocks.filter(b => !b.guidance)].flatMap(b => b.paragraphs).join('\n\n');
}

/** A body over `maxTokens` leads with its guidance and prohibitions before it is cut; one within it keeps its authored order. */
function renderEntityCard(entity: EntityCardRow, maxTokens: number): RenderedCard {
  const aliasLine = entity.aliases.length > 0 ? `\nAliases: ${entity.aliases.map(a => a.alias).join(', ')}` : '';
  const statusLine = entity.status != null ? `\nStatus: ${entity.status}` : '';
  const bodyRaw = entity.body ?? entity.notes ?? '';
  const overBudget = countTokens(bodyRaw) > maxTokens;
  const { text: body, truncated } = overBudget ? truncateAtParagraph(guidanceFirst(bodyRaw), maxTokens) : { text: bodyRaw, truncated: false };
  return { text: `**${entity.name}** (${entity.type}, ${entity.status ?? 'active'})\n${body}${aliasLine}${statusLine}`, truncated };
}

function entityLabel(entity: Pick<EntityCardRow, 'name' | 'type'>, pov = false): string {
  return `${pov ? 'POV ' : ''}${entity.type.toUpperCase().replace(/_/g, ' ')}: ${entity.name}`;
}

type WorldFactRow = typeof schema.worldFacts.$inferSelect;

interface ResolvedRefRows {
  entityMap: Map<string, EntityCardRow>;
  worldFactRows: WorldFactRow[];
  threadMap: Map<string, typeof schema.plotThreads.$inferSelect>;
  mysteryMap: Map<string, typeof schema.mysteries.$inferSelect>;
  chapterMap: Map<number, typeof schema.chapters.$inferSelect>;
  volumeMap: Map<string, schema.Plan.Volume>;
  bibleDocMap: Map<string, typeof schema.bibleDocuments.$inferSelect>;
  factMap: Map<string, CanonFactRow>;
  hiddenFactKeys: ReadonlySet<string> | null;
  disclosure: WriterDisclosurePolicy;
  bridges: ReadonlyMap<number, IsolationBridge>;
}

type CanonFactRow = typeof schema.canonFacts.$inferSelect;

// The catalog lists world facts as `category: key | key`, so an outliner ref may name either. Category
// wins because it was the only reading before keys resolved; `category/key` pins a single fact.
function matchWorldFacts(rows: WorldFactRow[], value: string): { facts: WorldFactRow[]; byKey: boolean } | null {
  const byCategory = rows.filter(f => f.category === value);
  if (byCategory.length > 0) return { facts: byCategory, byKey: false };
  const slash = value.indexOf('/');
  const pinned = slash === -1 ? [] : rows.filter(f => f.category === value.slice(0, slash) && f.key === value.slice(slash + 1));
  if (pinned.length > 0) return { facts: pinned, byKey: true };
  const byKey = rows.filter(f => f.key === value);
  return byKey.length > 0 ? { facts: byKey, byKey: true } : null;
}

function makeRefSection(ref: string, label: string, content: string, tier: ContextTier, truncated = false): ContextSection {
  const rendered = renderLabeledSection(label, content);
  return { key: `ref:${ref}`, tier, segment: 'volatile', tokens: countTokens(rendered), truncated, sourceRefs: [ref], rendered };
}

function entityCardTier(status: EntityCardRow['status']): ContextTier {
  return status === 'planned' ? 'approved_intent' : 'canonical';
}

function sumTokens(sections: ContextSection[]): number {
  return sections.reduce((sum, section) => sum + section.tokens, 0);
}

/** The content a section may hold when the section itself, heading included, must fit in `available`. */
function sizedSectionCeiling(key: string, available: number): number {
  return Math.max(0, available - countTokens(renderSection(key, '')) - SIZED_SECTION_MARGIN);
}

type CharacterStateRow = typeof schema.characterStates.$inferSelect;
type EntityRelationshipRow = typeof schema.entityRelationships.$inferSelect;

function renderCharacterState(name: string, state: CharacterStateRow): string | null {
  const lines: string[] = [];
  if (state.location) lines.push(`Location: ${state.location}`);
  if (state.conditions && state.conditions.length > 0) lines.push(`Conditions: ${state.conditions.join(', ')}`);
  if (state.immediateGoal) lines.push(`Goal: ${state.immediateGoal}`);
  if (state.statusNote) lines.push(`Status: ${state.statusNote}`);
  if (lines.length === 0) return null;
  return [`**${name}** (as of ch ${state.lastUpdatedChapter})`, ...lines].join('\n');
}

interface RecentSummary {
  chapter: number;
  summary: string;
  draft: boolean;
  stale: boolean;
}

interface CarriedDraft {
  chapter: number;
  summary: string | null;
  staleReason: string | null;
}

/** An isolated chapter as a standard call reads it: its title withheld and its summary replaced by the approved bridge, or by a walled-off note. */
function walledOff<T extends { isolated: boolean; summary: string | null; title?: string | null }>(row: T, bridge: IsolationBridge | undefined): T {
  if (!row.isolated) return row;
  return { ...row, ...('title' in row ? { title: null } : {}), summary: bridgedSummary(row, bridge) ?? NO_BRIDGE_SUMMARY };
}

// A batch drafts chapter N before N-1 is finalized, so a chapter without a finalized row speaks through its draft's summary.
function recentSummaries(finalized: { number: number; summary: string | null }[], drafts: CarriedDraft[]): RecentSummary[] {
  const byChapter = new Map<number, RecentSummary>();
  for (const draft of drafts) {
    if (draft.summary?.trim()) byChapter.set(draft.chapter, { chapter: draft.chapter, summary: draft.summary, draft: true, stale: draft.staleReason != null });
  }
  for (const row of finalized) {
    const summary = row.summary?.trim() ? row.summary : (byChapter.get(row.number)?.summary ?? '');
    byChapter.set(row.number, { chapter: row.number, summary, draft: false, stale: false });
  }
  return [...byChapter.values()].sort((a, b) => a.chapter - b.chapter).slice(-RECENT_SUMMARY_COUNT);
}

function recentSummaryLine(entry: RecentSummary, index: number): string {
  const labels = [entry.draft ? '[DRAFT — not yet canon] ' : '', entry.stale ? `${STALE_LABEL} ` : ''].join('');
  return `${index + 1}. ${labels}Ch ${entry.chapter}: ${entry.summary}`;
}

function staleDraftPrefix(draft: { staleReason: string | null } | null | undefined): string {
  return draft?.staleReason != null ? `${STALE_LABEL}\n` : '';
}

// Only the tail reaches the writer, so only a margin around it is scrubbed; a passage cut at the margin is still caught by its sentences.
function scrubbedTail(prose: string, disclosure: WriterDisclosurePolicy): string {
  return disclosure.scrub(truncateAtParagraphTail(prose, PREV_ENDING_TAIL * 2).text, 'prose');
}

function renderCarriedState(state: unknown, disclosure: WriterDisclosurePolicy): string {
  return typeof state === 'string' ? disclosure.scrub(state, 'state') : JSON.stringify(disclosure.scrubState(state, ESTABLISHED_FACTS_MAX));
}

/**
 * Continuation state within `maxTokens`, shortened a whole entry at a time so it stays valid JSON: the largest entry goes first, and a
 * list loses its last item rather than all of them. A state stored as a list loses items from its end.
 */
function fittedState(state: unknown, disclosure: WriterDisclosurePolicy, maxTokens: number): string {
  const scrubbed = typeof state === 'string' ? null : disclosure.scrubState(state, ESTABLISHED_FACTS_MAX);
  if (Array.isArray(scrubbed)) {
    const items = [...scrubbed];
    while (items.length > 0 && countTokens(JSON.stringify(items)) > maxTokens) items.pop();
    return JSON.stringify(items);
  }
  if (scrubbed === null || typeof scrubbed !== 'object') return renderCarriedState(state, disclosure);
  const entries = Object.entries(scrubbed);
  let text = JSON.stringify(scrubbed);
  while (countTokens(text) > maxTokens && entries.length > 0) {
    const largest = entries.reduce((top, entry) => (JSON.stringify(entry[1]).length > JSON.stringify(top[1]).length ? entry : top));
    if (Array.isArray(largest[1]) && largest[1].length > 1) largest[1] = largest[1].slice(0, -1);
    else entries.splice(entries.indexOf(largest), 1);
    text = JSON.stringify(Object.fromEntries(entries));
  }
  return text;
}

/** With `maxTokens`, the summary takes at most half and the state is shortened whole entries at a time into the rest, so no cut ever lands inside its JSON. */
function renderIsolatedEnding(summary: string | null, state: unknown, disclosure: WriterDisclosurePolicy, maxTokens?: number): string {
  const scrubbed = disclosure.scrub(summary ?? '', 'summary');
  if (maxTokens === undefined) return `Summary: ${scrubbed}\nState: ${state ? renderCarriedState(state, disclosure) : 'null'}`;
  const head = `Summary: ${truncateAtParagraph(scrubbed, Math.floor(maxTokens / 2)).text}\nState: `;
  return `${head}${state ? fittedState(state, disclosure, maxTokens - countTokens(head)) : 'null'}`;
}

// `entity_relationships` is append-only — one row per chapter that observed the pair — so current state
// is the highest-chapter row per (entityId, targetKey, kind), with the later insert winning a tie.
function latestRelationships(rows: EntityRelationshipRow[]): EntityRelationshipRow[] {
  const latest = new Map<string, EntityRelationshipRow>();
  for (const row of rows) {
    const key = `${row.entityId}::${row.targetKey}::${row.kind}`;
    const current = latest.get(key);
    if (!current || (row.chapter ?? -1) > (current.chapter ?? -1) || ((row.chapter ?? -1) === (current.chapter ?? -1) && row.id > current.id)) latest.set(key, row);
  }
  return [...latest.values()];
}

@Injectable()
export class ContextAssembler {
  private readonly logger = Logger.getLogger(APP_NAME, ContextAssembler.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly catalogService: CatalogService,
    private readonly retrievalService?: RetrievalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** The active ledger, for a planner that reads the Story Bible outside a pack. */
  activeLedger(projectId: bigint): Promise<Ledger.Entry[]> {
    return loadActiveLedger(this.db, projectId);
  }

  catalog(projectId: bigint, options?: CatalogOptions): Promise<string> {
    return this.catalogService.render(projectId, options);
  }

  /** `chapter` is the chapter the refs are resolved for; it makes the sections writer-safe for it. */
  async resolveRefs(projectId: bigint, refs: string[], chapter?: number): Promise<ResolvedRefs> {
    const disclosure = chapter !== undefined && refs.length > 0 ? await loadWriterDisclosurePolicy(this.db, projectId, chapter) : WriterDisclosurePolicy.planner();
    return this.resolveRefsFor(projectId, refs, chapter, disclosure);
  }

  /** Which refs the writer of `chapter` would read under `disclosure`, by ref alone: a preview never carries their content. */
  async writerRefs(projectId: bigint, refs: string[], chapter: number, disclosure: WriterDisclosurePolicy, overlay?: PlanOverlay): Promise<WriterRefs> {
    if (refs.length === 0) return { included: [], unresolved: [], withheld: [], constraints: [] };
    const { resolved, unresolved, withheld, constraints } = await this.resolveRefsFor(projectId, refs, chapter, disclosure, overlay);
    return { included: resolved.flatMap(section => section.sourceRefs), unresolved, withheld, constraints };
  }

  private async resolveRefsFor(
    projectId: bigint,
    refs: string[],
    chapter: number | undefined,
    disclosure: WriterDisclosurePolicy,
    overlay?: PlanOverlay,
    loadBridges: BridgeLoader = bridgeLoader(this.db, projectId),
  ): Promise<ResolvedRefs> {
    const refused = refs.filter(ref => !disclosure.canResolve(ref));
    const uniqueRefs = [...new Set(refs)].filter(ref => disclosure.canResolve(ref));
    const entityKeys: string[] = [];
    const worldFactValues: string[] = [];
    const threadKeys: string[] = [];
    const mysteryKeys: string[] = [];
    const chapterNumbers: number[] = [];
    const volumeKeys: string[] = [];
    const bibleDocRefs: { section: string; slug: string }[] = [];
    const factKeys: string[] = [];

    for (const ref of uniqueRefs) {
      const colon = ref.indexOf(':');
      if (colon === -1) continue;
      const prefix = ref.slice(0, colon);
      const value = ref.slice(colon + 1);
      switch (prefix) {
        case 'entity':
          entityKeys.push(value);
          break;
        case 'world_fact':
          worldFactValues.push(value, ...value.split('/'));
          break;
        case 'thread':
          threadKeys.push(value);
          break;
        case 'mystery':
          mysteryKeys.push(value);
          break;
        case 'chapter':
          chapterNumbers.push(parseInt(value, 10));
          break;
        case 'volume':
          volumeKeys.push(value);
          break;
        case 'bible_doc': {
          const slashIdx = value.indexOf('/');
          bibleDocRefs.push({ section: slashIdx === -1 ? value : value.slice(0, slashIdx), slug: slashIdx === -1 ? '' : value.slice(slashIdx + 1) });
          break;
        }
        case 'fact':
          factKeys.push(value);
          break;
      }
    }

    const worldFactLookup = [...new Set(worldFactValues)];
    const [entitiesRows, worldFactRows, threadRows, mysteryRows, chapterRows, volumeRows, bibleDocRows, factRows] = await Promise.all([
      entityKeys.length > 0
        ? this.db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)), with: { aliases: true } })
        : [],
      worldFactLookup.length > 0
        ? this.db.query.worldFacts.findMany({
            where: and(eq(schema.worldFacts.projectId, projectId), or(inArray(schema.worldFacts.category, worldFactLookup), inArray(schema.worldFacts.key, worldFactLookup))),
            orderBy: [schema.worldFacts.category, schema.worldFacts.key],
          })
        : [],
      threadKeys.length > 0
        ? this.db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), inArray(schema.plotThreads.threadKey, threadKeys)) })
        : [],
      mysteryKeys.length > 0 ? this.db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), inArray(schema.mysteries.mysteryKey, mysteryKeys)) }) : [],
      chapterNumbers.length > 0 ? this.db.query.chapters.findMany({ where: and(eq(schema.chapters.projectId, projectId), inArray(schema.chapters.number, chapterNumbers)) }) : [],
      volumeKeys.length > 0 ? this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.volumeKey, volumeKeys)) }) : [],
      bibleDocRefs.length > 0
        ? this.db.query.bibleDocuments.findMany({
            where: and(
              eq(schema.bibleDocuments.projectId, projectId),
              inArray(schema.bibleDocuments.section, [...new Set(bibleDocRefs.map(r => r.section))] as schema.Bible.Section[]),
              inArray(schema.bibleDocuments.slug, [...new Set(bibleDocRefs.map(r => r.slug))]),
            ),
          })
        : [],
      factKeys.length > 0 ? this.db.query.canonFacts.findMany({ where: and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.factKey, factKeys)) }) : [],
    ]);

    const entityMap = new Map(entitiesRows.map(e => [e.entityKey, e]));
    const threadMap = new Map(threadRows.map(t => [t.threadKey, t]));
    const mysteryMap = new Map(mysteryRows.map(m => [m.mysteryKey, m]));
    const chapterMap = new Map(chapterRows.map(c => [c.number, c]));
    const volumeMap = new Map(volumeRows.map(v => [v.volumeKey, v]));
    const bibleDocMap = new Map(bibleDocRows.map(d => [`${d.section}/${d.slug}`, d]));
    const factMap = new Map(factRows.map(f => [f.factKey, f]));
    const hiddenFactKeys = chapter !== undefined && factRows.length > 0 ? await loadWriterHiddenFactKeys(this.db, projectId, chapter, factRows, overlay) : null;
    const bridges = await loadBridges(chapterRows.map(row => ({ chapter: row.number, isolated: row.isolated })));

    const resolved: ContextSection[] = [];
    const unresolved: string[] = [];
    const withheld: string[] = [...new Set(refused)];
    const constraints: string[] = [];

    for (const ref of uniqueRefs) {
      const colon = ref.indexOf(':');
      const prefix = colon === -1 ? '' : ref.slice(0, colon);
      const value = ref.slice(colon + 1);
      if (prefix === 'fact' && hiddenFactKeys?.has(value) && !factMap.get(value)?.writerNote?.trim()) continue;
      const opened = prefix === 'thread' ? threadMap.get(value) : prefix === 'mystery' ? mysteryMap.get(value) : undefined;
      if (opened && !disclosure.opensBy(opened.openedChapter)) {
        withheld.push(ref);
        continue;
      }
      const rows = { entityMap, worldFactRows, threadMap, mysteryMap, chapterMap, volumeMap, bibleDocMap, factMap, hiddenFactKeys, disclosure, bridges };
      const section = this.resolveRef(ref, prefix, value, rows);
      if (!section) unresolved.push(ref);
      else resolved.push(section);
      if (section && prefix === 'fact' && hiddenFactKeys?.has(value)) constraints.push(ref);
    }

    const characters = uniqueRefs.filter(ref => ref.startsWith('entity:') && entityMap.get(ref.slice('entity:'.length))?.type === 'character');
    return { resolved, unresolved, withheld, characters, constraints };
  }

  /**
   * Sanitizes a model-written `requiredContext`: drops refs that resolve to nothing and every `fact:` ref, because an
   * outliner reading the catalog sees hidden facts in full and must never pin one into a chapter's context. A planner-only
   * page never resolves, so a ref to one is dropped with the rest.
   */
  async sanitizeOutlinedRefs(projectId: bigint, refs: string[]): Promise<{ kept: string[]; dropped: string[] }> {
    const candidates = refs.filter(ref => !ref.startsWith('fact:'));
    const { unresolved } = candidates.length > 0 ? await this.resolveRefs(projectId, candidates) : { unresolved: [] };
    const unresolvedSet = new Set(unresolved);
    const kept = candidates.filter(ref => !unresolvedSet.has(ref));
    const keptSet = new Set(kept);
    return { kept, dropped: refs.filter(ref => !keptSet.has(ref)) };
  }

  private resolveRef(ref: string, prefix: string, value: string, rows: ResolvedRefRows): ContextSection | null {
    const heading = (label: string): string => rows.disclosure.scrub(label, 'heading');
    const content = (text: string, field: 'entity' | 'reference' | 'summary' | 'plan' | 'bible_page' | 'knowledge'): string => rows.disclosure.scrub(text, field);
    switch (prefix) {
      case 'entity': {
        const entity = rows.entityMap.get(value);
        if (!entity) return null;
        const card = renderEntityCard(entity, ENTITY_CARD_BUDGET);
        return makeRefSection(ref, heading(entityLabel(entity)), content(card.text, 'entity'), entityCardTier(entity.status), card.truncated);
      }
      case 'world_fact': {
        const match = matchWorldFacts(rows.worldFactRows, value);
        if (!match) return null;
        const lines = match.facts.map(f => `${match.byKey ? `${f.category}/` : ''}${f.key}: ${truncateAtParagraph(f.value, 150).text}`);
        return makeRefSection(ref, heading(`WORLD FACTS: ${value}`), content(lines.join('\n'), 'reference'), 'canonical');
      }
      case 'thread': {
        const thread = rows.threadMap.get(value);
        if (!thread) return null;
        const text = `**${thread.threadKey}** (${thread.status}, ch ${thread.openedChapter ?? '?'}–${thread.closedChapter ?? '?'})\n${thread.summary ?? ''}`;
        return makeRefSection(ref, heading(`PLOT THREAD: ${thread.threadKey}`), content(text, 'reference'), 'canonical');
      }
      case 'mystery': {
        const mystery = rows.mysteryMap.get(value);
        if (!mystery) return null;
        const text = `**${mystery.mysteryKey}** (${mystery.status}, ch ${mystery.openedChapter ?? '?'})\n${mystery.question}`;
        return makeRefSection(ref, heading(`MYSTERY: ${mystery.mysteryKey}`), content(text, 'reference'), 'canonical');
      }
      case 'chapter': {
        const n = parseInt(value, 10);
        const found = rows.chapterMap.get(n);
        if (!found) return null;
        const chapter = walledOff(found, rows.bridges.get(n));
        const isDraft = chapter.status !== 'done';
        const text = `${isDraft ? '[DRAFT — not yet canon] ' : ''}Ch ${n}: ${content(chapter.summary ?? '', 'summary')}`;
        return makeRefSection(ref, heading(`EARLIER CHAPTER: ${n}${chapter.title ? ` — ${chapter.title}` : ''}`), text, isDraft ? 'working' : 'canonical');
      }
      case 'volume': {
        const volume = rows.volumeMap.get(value);
        if (!volume) return null;
        const text = `**${volume.title ?? volume.volumeKey}**\nGoal: ${volume.objective ?? ''}`;
        return makeRefSection(ref, heading(`VOLUME: ${volume.title ?? volume.volumeKey}`), content(text, 'plan'), 'approved_intent');
      }
      case 'bible_doc': {
        const doc = rows.bibleDocMap.get(value.includes('/') ? value : `${value}/`);
        if (!doc?.body || isWriterExcludedBibleDoc(doc)) return null;
        const { text: body, truncated } = truncateAtParagraph(doc.body, 8_000);
        return makeRefSection(ref, heading(`BIBLE: ${doc.section}/${doc.slug}`), content(body, 'bible_page'), 'canonical', truncated);
      }
      case 'fact': {
        const fact = rows.factMap.get(value);
        if (!fact) return null;
        if (rows.hiddenFactKeys?.has(fact.factKey)) return makeRefSection(ref, 'WRITING CONSTRAINT', content(fact.writerNote?.trim() ?? '', 'knowledge'), 'approved_intent');
        if (rows.hiddenFactKeys) return makeRefSection(ref, heading(`CANON FACT: ${fact.factKey}`), content(`**${fact.factKey}**: ${fact.text}`, 'knowledge'), 'canonical');
        const constraintLine = fact.constraintNote ? `\nConstraint: ${fact.constraintNote}` : '';
        return makeRefSection(ref, `CANON FACT: ${fact.factKey}`, `**${fact.factKey}**: ${fact.text}${constraintLine}`, 'canonical');
      }
      default:
        return null;
    }
  }

  async forChapter(projectId: bigint, chapter: number, opts?: ChapterPackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? DEFAULT_BUDGET;

    const [project, brief, prevChapter, recentChapters, recentDrafts, prevDraft] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter - 1)) }),
      this.db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), sql`${schema.chapters.number} < ${chapter}`, eq(schema.chapters.status, 'done')),
        orderBy: sql`${schema.chapters.number} DESC`,
        limit: RECENT_SUMMARY_COUNT,
        columns: { number: true, summary: true, isolated: true },
      }),
      this.db.query.drafts.findMany({
        where: and(eq(schema.drafts.projectId, projectId), between(schema.drafts.chapter, chapter - RECENT_SUMMARY_COUNT, chapter - 1)),
        columns: { chapter: true, summary: true, staleReason: true, isolated: true },
      }),
      this.db.query.drafts.findFirst({
        where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter - 1)),
        columns: { body: true, summary: true, state: true, isolated: true, staleReason: true },
      }),
    ]);

    const currentVolumeKey = brief?.volumeKey ?? (await nearestVolumeKey(this.db, projectId, chapter));
    const loadBridges = bridgeLoader(this.db, projectId);
    const [disclosure, ledger, currentVolume] = await Promise.all([
      opts?.disclosure ?? loadWriterDisclosurePolicy(this.db, projectId, chapter),
      loadActiveLedger(this.db, projectId),
      this.volumeByKey(projectId, currentVolumeKey),
    ]);
    const knowledgeContract = parseKnowledgeContract(brief?.knowledgeContract);
    const pov = brief?.pov ?? null;
    const contextRefs = Array.isArray(brief?.contextRefs) ? (brief.contextRefs as string[]) : [];
    const castRefs = [...new Set(knowledgeContract?.pov ?? [])].filter(key => key !== pov).map(key => `entity:${key}`);
    const chapterCast = new Set([
      ...(pov ? [pov] : []),
      ...(knowledgeContract?.pov ?? []),
      ...contextRefs.filter(ref => ref.startsWith('entity:')).map(ref => ref.slice('entity:'.length)),
    ]);
    const [writerBrief, completedVolumes, openCanon] = await Promise.all([
      loadWriterBrief(this.db, projectId, chapter, brief, disclosure),
      this.completedVolumesSection(projectId, chapter, currentVolume, disclosure, loadBridges),
      knowledgeContract ? null : this.openCanonSection(projectId, disclosure, chapterCast),
    ]);
    const prevStale = staleDraftPrefix(prevDraft);
    const prevRefs = [`chapter:${chapter - 1}`];
    const derivedCuts: OmittedSection[] = [...(openCanon?.omitted ?? [])];

    const planTokens = countTokens(writerBrief.chapterBrief) + countTokens(writerBrief.endingContract);
    const reservations: WriterReservation[] = [{ name: 'the chapter plan', tokens: planTokens, cap: WRITER_SECTION_CAPS.chapterPlan, fromPlan: true }];
    const sections: ContextSection[] = [];
    const reserve = (section: ContextSection, name: string, cap: number, fromPlan = false): void => {
      sections.push({ ...section, required: true });
      reservations.push({ name, tokens: section.tokens, cap, fromPlan });
    };
    const reserveDerived = (section: ContextSection, name: string, cap: number, fromPlan = false): void => reserve(fitToCap(section, cap), name, cap, fromPlan);
    const isolatedEndingRoom = sizedSectionCeiling('prev_ending', WRITER_SECTION_CAPS.prevEnding);
    const reservePrevEnding = (section: ContextSection): void => reserveDerived(section, "the previous chapter's ending", WRITER_SECTION_CAPS.prevEnding);
    const prevIsolated = Boolean(prevChapter?.isolated || prevDraft?.isolated);
    // The unrestricted route may read an isolated chapter as written; every other reader gets only its approved bridge.
    const rawIsolated = opts?.policy?.writerClass === 'permissive';
    const bridgeSubjects: BridgeSubject[] = [
      ...recentChapters.map(row => ({ chapter: row.number, isolated: row.isolated })),
      ...recentDrafts,
      { chapter: chapter - 1, isolated: prevIsolated },
    ];
    const bridges = rawIsolated ? new Map<number, IsolationBridge>() : await loadBridges(bridgeSubjects);
    const prevBridge = bridges.get(chapter - 1);
    const prevState = prevIsolated && !rawIsolated ? standardReadableState(prevBridge) : prevDraft?.state;
    const isolatedEnding = (summary: string | null, room: number): string => {
      if (rawIsolated) return renderIsolatedEnding(summary, prevState, disclosure, room);
      return prevBridge ? renderIsolatedEnding(prevBridge.summary, prevState, disclosure, room) : NO_APPROVED_BRIDGE;
    };

    if (prevChapter) {
      const tier: ContextTier = prevChapter.status === 'done' ? 'canonical' : 'working';
      if (prevChapter.isolated) {
        reservePrevEnding(makeSection('prev_ending', isolatedEnding(prevChapter.summary, isolatedEndingRoom), tier, prevRefs));
      } else {
        reservePrevEnding(makeSectionTail('prev_ending', scrubbedTail(prevChapter.content ?? '', disclosure), PREV_ENDING_TAIL, tier, prevRefs));
      }
    } else if (prevDraft?.isolated) {
      reservePrevEnding(
        makeSection(
          'prev_ending',
          `[DRAFT — not yet canon]\n${prevStale}${isolatedEnding(prevDraft.summary, isolatedEndingRoom - countTokens(`[DRAFT — not yet canon]\n${prevStale}`))}`,
          'working',
          prevRefs,
        ),
      );
    } else if (prevDraft?.body) {
      // Chapter N-1 hasn't been finalized yet (mid-batch): the `chapters` row doesn't exist, so fall back
      // to the just-drafted prose tail instead of leaving chapter N with only continuation-state fields.
      const { text, truncated } = truncateAtParagraphTail(scrubbedTail(prevDraft.body, disclosure), PREV_ENDING_TAIL);
      const rendered = renderSection('prev_ending', `[DRAFT — not yet canon]\n${prevStale}${text}`);
      reservePrevEnding({ key: 'prev_ending', tier: 'working', segment: 'volatile', tokens: countTokens(rendered), truncated, sourceRefs: prevRefs, rendered });
    }

    if (prevState != null) {
      const cap = WRITER_SECTION_CAPS.continuationState;
      const state = fittedState(prevState, disclosure, sizedSectionCeiling('continuation_state', cap) - countTokens(prevStale));
      reserveDerived(makeSection('continuation_state', `${prevStale}${state}`, 'working', prevRefs), 'the continuation state', cap);
    }

    if (currentVolume?.objective) {
      const content = disclosure.scrub(currentVolume.objective, 'plan');
      reserve(
        asStable(makeSection('volume_objective', content, 'approved_intent', [`volume:${currentVolume.volumeKey}`])),
        "the current volume's goal",
        WRITER_SECTION_CAPS.volumeGoal,
      );
    }
    if (completedVolumes) reserveDerived(completedVolumes, 'the earlier volumes', WRITER_SECTION_CAPS.completedVolumes);
    if (openCanon) reserveDerived(openCanon.section, 'the book rules (open canon)', WRITER_SECTION_CAPS.openCanon);

    // Only the POV cast's ledgered facts enter the drafting pack; still-hidden facts surface as their writer
    // notes, never as text. Absent a contract the feature is off and nothing changes. With a contract
    // the known-facts section is always present, so a cast that knows nothing is told so rather than left
    // to infer it from a missing heading. Facts accumulate with the book, so what the cast knows and the
    // constraints are cut to their limits — the chapter's own cast first — and never fail a chapter.
    if (knowledgeContract) {
      const view = await loadKnowledgeView(this.db, projectId, chapter, knowledgeContract);
      const learnedIn = view.learnedIn ?? new Map<string, number>();
      const open = (fact: FactLike): boolean => !learnedIn.has(fact.factKey);
      const known = fitFacts(
        subjectsFirst(
          [...view.known.filter(open), ...view.known.filter(fact => !open(fact)).sort((a, b) => (learnedIn.get(b.factKey) ?? 0) - (learnedIn.get(a.factKey) ?? 0))],
          chapterCast,
        ),
        fact => renderKnownFacts([fact]),
        sizedSectionCeiling('known_facts', WRITER_SECTION_CAPS.knownFacts),
      );
      derivedCuts.push(...known.omitted);
      const knownSection = makeSection(
        'known_facts',
        disclosure.scrub(renderKnownFacts(known.kept), 'knowledge'),
        'canonical',
        known.kept.map(f => `fact:${f.factKey}`),
      );
      reserveDerived(knownSection, 'what the point-of-view cast knows', WRITER_SECTION_CAPS.knownFacts);
      if (view.reveals.length > 0) {
        const reveals = makeSection(
          'chapter_reveals',
          disclosure.scrub(renderChapterReveals(view.reveals), 'knowledge'),
          'approved_intent',
          view.reveals.map(f => `fact:${f.factKey}`),
        );
        reserve(reveals, "this chapter's reveals", WRITER_SECTION_CAPS.chapterReveals);
      }
      if (view.readerKnows.length > 0) {
        const readerKnows = fitFacts(
          subjectsFirst(view.readerKnows, chapterCast),
          fact => renderReaderKnows([fact], view.pooledPov),
          sizedSectionCeiling('reader_knows', WRITER_SECTION_CAPS.readerKnows),
        );
        derivedCuts.push(...readerKnows.omitted);
        const section = makeSection(
          'reader_knows',
          disclosure.scrub(renderReaderKnows(readerKnows.kept, view.pooledPov), 'knowledge'),
          'canonical',
          readerKnows.kept.map(f => `fact:${f.factKey}`),
        );
        sections.push({ ...fitToCap(section, WRITER_SECTION_CAPS.readerKnows), priority: WRITER_OPTIONAL_PRIORITY.readerKnows });
      }
      const hidden = fitFacts(
        subjectsFirst(withWriterNotes(view.hidden), chapterCast),
        fact => renderHiddenConstraints([fact]),
        sizedSectionCeiling('hidden_constraints', WRITER_SECTION_CAPS.hiddenConstraints),
      );
      derivedCuts.push(...hidden.omitted);
      const constraints = disclosure.scrub(renderHiddenConstraints(hidden.kept), 'knowledge');
      if (constraints) {
        const section = makeSection(
          'hidden_constraints',
          constraints,
          'approved_intent',
          hidden.kept.map(f => `fact:${f.factKey}`),
        );
        reserveDerived(section, 'the behavioural constraints', WRITER_SECTION_CAPS.hiddenConstraints);
      }
    }
    const clues = allowedCluesSection(disclosure);
    if (clues) reserve(clues, 'the allowed clues', WRITER_SECTION_CAPS.allowedClues);

    const refs = chapterWriterRefs(brief);
    let unresolvedRefs: string[] = [];
    let withheldRefs: string[] = [];
    let refSections: ContextSection[] = [];
    let characterRefs = new Set<string>();
    let requiredCharacters = new Set<string>();

    if (refs.length > 0) {
      const { resolved, unresolved, withheld, characters } = await this.resolveRefsFor(projectId, refs, chapter, disclosure, undefined, loadBridges);
      const carriedKeys = new Set(['hidden_constraints', 'open_canon', 'volume_objective', 'completed_volumes']);
      const carried = new Set(sections.filter(s => carriedKeys.has(s.key)).flatMap(s => s.sourceRefs));
      unresolvedRefs = unresolved;
      withheldRefs = withheld;
      characterRefs = new Set(characters.map(ref => `ref:${ref}`));
      requiredCharacters = new Set(
        characters
          .filter(ref => contextRefs.includes(ref) && ref !== `entity:${pov}` && !castRefs.includes(ref))
          .slice(0, FULL_CAST_MAX)
          .map(ref => `ref:${ref}`),
      );
      refSections = resolved.filter(section => !section.sourceRefs.some(ref => carried.has(ref)));
    }

    const povSection = pov ? await this.povEntitySection(projectId, pov, disclosure) : null;
    if (pov && !povSection && !unresolvedRefs.includes(`entity:${pov}`)) unresolvedRefs = [...unresolvedRefs, `entity:${pov}`];

    // Only the first FULL_CAST_MAX entity cards render ahead of memory and style; the rest move below them. The POV card leads,
    // then the rest of the POV cast — whose heads the chapter is in outrank every other card, and the outliner does not always list them.
    // The first FULL_CAST_MAX characters the plan cites are required and cut to their limit; later ones and other entities compete for what is left.
    const castKeys = new Set(castRefs.map(ref => `ref:${ref}`));
    const entityCards = refSections.filter(s => s.key.startsWith('ref:entity:') && s.key !== povSection?.key);
    const entityRefSections = [...(povSection ? [povSection] : []), ...entityCards.filter(s => castKeys.has(s.key)), ...entityCards.filter(s => !castKeys.has(s.key))];
    const nonEntityRefSections = refSections.filter(s => !s.key.startsWith('ref:entity:'));
    const placeCard = (card: ContextSection, optionalPriority: number): void => {
      const stable = asStable(card);
      const sheet = `${sectionSubject(card)}'s character sheet`;
      if (card === povSection) reserveDerived(stable, sheet, WRITER_SECTION_CAPS.povCard, true);
      else if (castKeys.has(card.key) || requiredCharacters.has(card.key)) reserveDerived(stable, sheet, WRITER_SECTION_CAPS.castCard, true);
      else sections.push({ ...stable, priority: characterRefs.has(card.key) ? WRITER_OPTIONAL_PRIORITY.castCard : optionalPriority });
    };

    for (const card of entityRefSections.slice(0, FULL_CAST_MAX)) placeCard(card, WRITER_OPTIONAL_PRIORITY.castCard);
    for (const s of nonEntityRefSections) sections.push({ ...asStable(s), priority: WRITER_OPTIONAL_PRIORITY.citedPage });

    for (const s of await this.dynamicCastSections(projectId, entityRefSections, pov, disclosure)) sections.push({ ...s, priority: WRITER_OPTIONAL_PRIORITY.castState });

    const readable = <T extends { isolated: boolean; summary: string | null }>(row: T, number: number): T => (rawIsolated ? row : walledOff(row, bridges.get(number)));
    const recent = recentSummaries(
      recentChapters.map(row => readable(row, row.number)),
      recentDrafts.map(row => readable(row, row.chapter)),
    );
    if (recent.length > 0) {
      const lines = recent.map((entry, index) =>
        recentSummaryLine({ ...entry, summary: truncateAtParagraph(disclosure.scrub(entry.summary, 'summary'), RECENT_SUMMARY_MAX).text }, index),
      );
      const tier: ContextTier = recent.some(entry => entry.draft) ? 'working' : 'canonical';
      reserveDerived(makeSection('memory', lines.join('\n'), tier, []), 'the recent chapter summaries', WRITER_SECTION_CAPS.recentSummaries);
    }

    reserveDerived(asStable(writingStyleSection(project?.instructions, disclosure)), 'the style guide', WRITER_SECTION_CAPS.writingStyle);

    for (const card of entityRefSections.slice(FULL_CAST_MAX)) placeCard(card, WRITER_OPTIONAL_PRIORITY.excessCard);

    // Pushed after every other core section so the author's decisions render next to the brief, which the template appends after the pack.
    const writerLines = writerLinesSection(ledger, disclosure);
    if (writerLines) reserve(writerLines, "the author's decisions for the writer", WRITER_SECTION_CAPS.writerLines);

    const plugins = pluginContextSections(opts?.policy, sections, disclosure).map(section =>
      section.required ? section : { ...section, priority: WRITER_OPTIONAL_PRIORITY.pluginSection },
    );
    for (const section of plugins.filter(s => s.required)) {
      reservations.push({ name: `the plugin section "${sectionSubject(section)}"`, tokens: section.tokens, cap: WRITER_SECTION_CAPS.pluginSection });
    }
    if (opts?.enforceWriterReservations) assertWriterContextFits(reservations, budgetTokens);

    // The plan reaches the writer beside the pack rather than in it, so the pack gets the budget the plan leaves.
    const pack = await this.finalize(projectId, 'generation', chapter, [...sections, ...plugins], unresolvedRefs, Math.max(0, budgetTokens - planTokens), {
      dryRun: opts?.dryRun,
      disclosure,
      withheldRefs,
      omitted: derivedCuts,
    });
    if (!opts?.dryRun && pack.unresolvedRefs.length > 0) this.logger.warn('chapter pack could not resolve refs', { projectId, chapter, unresolvedRefs: pack.unresolvedRefs });
    if (!opts?.dryRun && pack.omitted.length > 0) this.logger.info('chapter pack cut context', { projectId, chapter, omitted: pack.omitted });
    if (!opts?.dryRun && (disclosure.withheld.size > 0 || withheldRefs.length > 0))
      this.logger.info('chapter pack withheld material', { projectId, chapter, withheld: Object.fromEntries(disclosure.withheld), withheldRefs });
    return pack;
  }

  /**
   * Open canon is every rule the whole book obeys; without a knowledge contract nothing else carries it all to the writer. Rules about the
   * chapter's cast come first, and those past the section's limit are cut and recorded rather than failing the chapter.
   */
  private async openCanonSection(
    projectId: bigint,
    disclosure: WriterDisclosurePolicy,
    chapterCast: ReadonlySet<string>,
  ): Promise<{ section: ContextSection; omitted: OmittedSection[] } | null> {
    const facts = await this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: schema.canonFacts.factKey });
    const locked = new Set(disclosure.lockedFacts.map(fact => fact.factKey));
    const open = facts.filter(fact => isOpenCanon(fact.revealChapter) && !fact.unlock && !locked.has(fact.factKey));
    if (open.length === 0) return null;
    const fitted = fitFacts(subjectsFirst(open, chapterCast), fact => renderKnownFacts([fact]), sizedSectionCeiling('open_canon', WRITER_SECTION_CAPS.openCanon));
    // The cast decides which rules survive a cut, never their order: this is a stable section, so it renders by key whatever the chapter.
    const kept = [...fitted.kept].sort((left, right) => left.factKey.localeCompare(right.factKey));
    const omitted = fitted.omitted;
    const content = disclosure.scrub(renderKnownFacts(kept), 'knowledge');
    const section = asStable(
      makeSection(
        'open_canon',
        content,
        'canonical',
        kept.map(fact => `fact:${fact.factKey}`),
      ),
    );
    return { section, omitted };
  }

  /**
   * The volumes behind the chapter's own: every earlier volume when the chapter's volume is known, otherwise every volume whose goal is
   * met. A chapter belongs to the volume its plan names, or else the one it was imported into.
   */
  private async completedVolumesSection(
    projectId: bigint,
    chapter: number,
    current: schema.Plan.Volume | undefined,
    disclosure: WriterDisclosurePolicy,
    loadBridges: BridgeLoader,
  ): Promise<ContextSection | null> {
    const volumes = await this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal });
    const completed = volumes.filter(
      volume =>
        volume.volumeKey !== current?.volumeKey &&
        (current ? volume.ordinal < current.ordinal : volume.state === 'goal_met') &&
        disclosure.canResolve(`volume:${volume.volumeKey}`),
    );
    if (completed.length === 0) return null;

    const keys = new Set(completed.map(volume => volume.volumeKey));
    const planned = await this.db.query.briefs.findMany({
      columns: { chapter: true, volumeKey: true },
      where: and(eq(schema.briefs.projectId, projectId), isNotNull(schema.briefs.volumeKey), lt(schema.briefs.chapter, chapter)),
    });
    const plannedIn = new Map(planned.filter(row => row.volumeKey !== null).map(row => [row.chapter, row.volumeKey as string]));
    const plannedChapters = [...plannedIn].filter(([, volumeKey]) => keys.has(volumeKey)).map(([number]) => number);
    const importedIn = inArray(schema.chapters.volumeKey, [...keys]);
    const rows = await this.db.query.chapters.findMany({
      columns: { number: true, summary: true, volumeKey: true, isolated: true },
      where: and(
        eq(schema.chapters.projectId, projectId),
        eq(schema.chapters.status, 'done'),
        lt(schema.chapters.number, chapter),
        plannedChapters.length > 0 ? or(importedIn, inArray(schema.chapters.number, plannedChapters)) : importedIn,
      ),
      orderBy: schema.chapters.number,
    });

    const bridges = await loadBridges(rows.map(row => ({ chapter: row.number, isolated: row.isolated })));
    const byVolume = new Map<string, { number: number; summary: string }[]>();
    for (const row of [...rows].sort((left, right) => left.number - right.number)) {
      const volumeKey = plannedIn.get(row.number) ?? row.volumeKey;
      const summary = bridgedSummary(row, bridges.get(row.number));
      if (!volumeKey || !keys.has(volumeKey) || row.number >= chapter || !summary?.trim()) continue;
      byVolume.set(volumeKey, [...(byVolume.get(volumeKey) ?? []), { number: row.number, summary }]);
    }

    const rendered = renderCompletedVolumes(
      completed.map(volume => ({
        ordinal: volume.ordinal,
        title: disclosure.scrub(volume.title ?? volume.volumeKey, 'heading'),
        goal: volume.objective ? disclosure.scrub(volume.objective, 'plan') : null,
        chapters: byVolume.get(volume.volumeKey) ?? [],
      })),
      sizedSectionCeiling('completed_volumes', WRITER_SECTION_CAPS.completedVolumes) - COMPLETED_VOLUMES_NOTE_MARGIN,
      summary => disclosure.scrub(summary, 'summary'),
    );
    if (!rendered) return null;
    return asStable(
      makeSection(
        'completed_volumes',
        rendered,
        'canonical',
        completed.filter(volume => byVolume.has(volume.volumeKey)).map(volume => `volume:${volume.volumeKey}`),
      ),
    );
  }

  // The POV character's card is the one entity card that never pays the shared ENTITY_CARD_BUDGET cap: the
  // drafter writes from inside this head, so a truncated card is a truncated narrator. Only its own, far larger limit cuts it.
  private async povEntitySection(projectId: bigint, pov: string, disclosure: WriterDisclosurePolicy): Promise<ContextSection | null> {
    const entity = await this.db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, pov)), with: { aliases: true } });
    if (!entity) return null;
    const label = disclosure.scrub(entityLabel(entity, true), 'heading');
    const card = renderEntityCard(entity, POV_CARD_BODY_MAX);
    return makeRefSection(`entity:${pov}`, label, disclosure.scrub(card.text, 'entity'), entityCardTier(entity.status), card.truncated);
  }

  // Per-chapter dynamic state — never stable, and never project-wide: it is scoped to the cast the brief
  // already named plus its POV, so a hundred-character project still pays for only the characters on stage.
  private async dynamicCastSections(projectId: bigint, entityRefSections: ContextSection[], pov: string | null, disclosure: WriterDisclosurePolicy): Promise<ContextSection[]> {
    const castKeys = new Set(entityRefSections.map(s => s.key.slice('ref:entity:'.length)));
    if (pov) castKeys.add(pov);
    if (castKeys.size === 0) return [];

    const cast = [...castKeys];
    const [castEntities, states] = await Promise.all([
      this.db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, cast)) }),
      this.db.query.characterStates.findMany({ where: and(eq(schema.characterStates.projectId, projectId), inArray(schema.characterStates.entityKey, cast)) }),
    ]);

    const nameByKey = new Map(castEntities.map(e => [e.entityKey, e.name]));
    const sections: ContextSection[] = [];

    const inCast = states.filter(s => castKeys.has(s.entityKey)).sort((a, b) => a.entityKey.localeCompare(b.entityKey));
    const blocks = inCast.map(s => renderCharacterState(nameByKey.get(s.entityKey) ?? s.entityKey, s)).filter((block): block is string => block !== null);
    if (blocks.length > 0)
      sections.push(
        makeSection(
          'character_state',
          disclosure.scrub(blocks.join('\n\n'), 'summary'),
          'working',
          inCast.map(s => `entity:${s.entityKey}`),
        ),
      );

    const castIds = castEntities.filter(e => castKeys.has(e.entityKey)).map(e => e.id);
    if (castIds.length === 0) return sections;

    const nameById = new Map(castEntities.map(e => [e.id, e.name]));
    const keyById = new Map(castEntities.map(e => [e.id, e.entityKey]));
    const rows = await this.db.query.entityRelationships.findMany({
      where: and(eq(schema.entityRelationships.projectId, projectId), inArray(schema.entityRelationships.entityId, castIds)),
    });
    const lines = latestRelationships(rows.filter(r => nameById.has(r.entityId)))
      .map(r => {
        const note = r.note ? `: ${r.note}` : '';
        const at = r.chapter != null ? ` [ch ${r.chapter}]` : '';
        return `${nameById.get(r.entityId) ?? r.entityId} → ${r.targetKey} (${r.kind})${note}${at}`;
      })
      .sort((a, b) => a.localeCompare(b));
    if (lines.length > 0) {
      const refs = [...new Set(rows.map(r => keyById.get(r.entityId)).filter((key): key is string => key !== undefined))].map(key => `entity:${key}`);
      sections.push(makeSection('relationships', disclosure.scrub(lines.join('\n'), 'summary'), 'working', refs));
    }

    return sections;
  }

  async forOutline(projectId: bigint, chapter: number, opts?: OutlinePackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? OUTLINE_BUDGET;

    const [currentVolume, recentChapters] = await Promise.all([
      (opts?.volumeKey !== undefined ? Promise.resolve(opts.volumeKey) : nearestVolumeKey(this.db, projectId, opts?.insertAfter ?? chapter)).then(volumeKey =>
        this.volumeByKey(projectId, volumeKey),
      ),
      this.db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), sql`${schema.chapters.number} < ${chapter}`, eq(schema.chapters.status, 'done')),
        orderBy: sql`${schema.chapters.number} DESC`,
        limit: 3,
      }),
    ]);

    const sections: ContextSection[] = [];

    if (currentVolume?.objective) {
      sections.push({ ...makeSection('volume_objective', currentVolume.objective, 'approved_intent', [`volume:${currentVolume.volumeKey}`]), required: true });
    }

    const outlineBridges = await loadIsolationBridges(
      this.db,
      projectId,
      recentChapters.map(row => ({ chapter: row.number, isolated: row.isolated })),
    );
    const recentLines = recentChapters
      .slice()
      .reverse()
      .map(row => walledOff(row, outlineBridges.get(row.number)))
      .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
    if (recentLines.length > 0) {
      sections.push({ ...makeSection('memory', recentLines.join('\n'), 'canonical', []), required: true });
    }

    // The outliner may only cite what the catalog lists, so retrieval gives way to it under budget pressure; the catalog's ceiling is
    // what the other required sections leave, so none of them can be crowded out.
    const maxTokens = sizedSectionCeiling('catalog', budgetTokens - sumTokens(sections));
    const span = opts?.span ?? { start: chapter, end: chapter };
    const catalogText = await this.catalogService.render(projectId, { documents: true, maxTokens, span, insertAfter: opts?.insertAfter });
    if (catalogText) sections.push({ ...makeSection('catalog', catalogText, 'canonical', []), required: true });

    if (this.retrievalService) {
      const query = currentVolume?.objective?.split('\n')[0] ?? '';
      if (query) {
        const [proseHits, loreHits] = await Promise.all([
          this.retrievalService.searchProse(projectId, query).catch(() => [] as RetrievalHit[]),
          this.retrievalService.searchLore(projectId, query).catch(() => [] as RetrievalHit[]),
        ]);
        if (proseHits.length > 0) {
          const content = proseHits.map((h, i) => `${i + 1}. [Ch ${h.metadata.chapter}] ${h.text}`).join('\n\n');
          sections.push(makeSection('prose_retrieved', content, 'canonical', []));
        }
        if (loreHits.length > 0) {
          const content = loreHits.map((h, i) => `${i + 1}. [${h.metadata.kind}:${h.metadata.refKey}] ${h.text}`).join('\n\n');
          sections.push(makeSection('lore_retrieved', content, 'canonical', []));
        }
      }
    }

    return this.finalize(projectId, 'outline', chapter, sections, [], budgetTokens, opts);
  }

  async forValidationWindow(projectId: bigint, from: number, to: number, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? DEFAULT_BUDGET;

    const [chapterRows, threadRows, mysteryRows, worldFactRows] = await Promise.all([
      this.db.query.chapters.findMany({ where: and(eq(schema.chapters.projectId, projectId), between(schema.chapters.number, from, to)) }),
      this.db.query.plotThreads.findMany({
        where: and(
          eq(schema.plotThreads.projectId, projectId),
          lte(schema.plotThreads.openedChapter, to),
          or(sql`${schema.plotThreads.closedChapter} >= ${from}`, isNull(schema.plotThreads.closedChapter)),
        ),
      }),
      this.db.query.mysteries.findMany({
        where: and(
          eq(schema.mysteries.projectId, projectId),
          lte(schema.mysteries.openedChapter, to),
          or(sql`${schema.mysteries.resolvedChapter} >= ${from}`, isNull(schema.mysteries.resolvedChapter)),
        ),
      }),
      this.db.query.worldFacts.findMany({ where: eq(schema.worldFacts.projectId, projectId) }),
    ]);

    const sections: ContextSection[] = [];

    if (chapterRows.length > 0) {
      const windowBridges = await loadIsolationBridges(
        this.db,
        projectId,
        chapterRows.map(row => ({ chapter: row.number, isolated: row.isolated })),
      );
      const lines = chapterRows.map(row => walledOff(row, windowBridges.get(row.number))).map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
      sections.push(makeSection('chapter_window', lines.join('\n'), 'canonical', []));
    }

    if (threadRows.length > 0) {
      const lines = threadRows.map(t => `**${t.threadKey}** (${t.status}${t.intentionallyOpen ? ', intentionally open — do not flag as unresolved' : ''}): ${t.summary ?? ''}`);
      sections.push(makeSection('plot_threads', lines.join('\n'), 'canonical', []));
    }

    if (mysteryRows.length > 0) {
      const lines = mysteryRows.map(m => `**${m.mysteryKey}** (${m.status}${m.intentionallyOpen ? ', intentionally open — do not flag as unresolved' : ''}): ${m.question}`);
      sections.push(makeSection('mysteries', lines.join('\n'), 'canonical', []));
    }

    if (worldFactRows.length > 0) {
      // Keys-only, not full values: world facts aren't chapter-scoped (no range to filter by), so
      // every fact in the project lands in every validation window regardless of size — the same
      // unbounded shape catalog.service.ts already solved for its own project-wide render.
      const byCategory = new Map<string, string[]>();
      for (const f of worldFactRows) {
        if (!byCategory.has(f.category)) byCategory.set(f.category, []);
        const catKeys = byCategory.get(f.category);
        if (catKeys) catKeys.push(f.key);
      }
      const lines: string[] = [];
      for (const [cat, keys] of byCategory) {
        lines.push(`${cat}: ${keys.join(' | ')}`);
      }
      sections.push(makeSection('world_facts', lines.join('\n'), 'canonical', []));
    }

    return this.finalize(projectId, 'validation', null, sections, [], budgetTokens, opts);
  }

  /**
   * The stable sections are budgeted against a fixed reservation (prompt plus the history and message allowances), so the cached prefix does
   * not move as the conversation grows; the optional volatile sections absorb the difference from the request actually sent. This budgets the
   * first model round only: lookup rounds add their results on top, the pack never shrinks below `NOVEL_CHAT_PACK_FLOOR`, and the handoff is
   * always kept, so a request near the history ceiling may run past `NOVEL_CHAT_REQUEST_BUDGET`. Plugin sections ride in the volatile segment
   * whatever they ask for, since a stable one would move the cached prefix as the budget changes.
   */
  async forNovelChat(projectId: bigint, sessionStartedAt: Date, opts: NovelChatPackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const [project, ledger, volumes, threads, mysteries, entities, pages, facts, worldFacts, milestones, storedChapters, storedDrafts, plannedBriefs] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      loadActiveLedger(this.db, projectId),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
      this.db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.status, 'open')), orderBy: schema.plotThreads.threadKey }),
      this.db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.status, 'open')), orderBy: schema.mysteries.mysteryKey }),
      this.db.query.entities.findMany({ columns: { entityKey: true, name: true, type: true, significance: true }, where: eq(schema.entities.projectId, projectId) }),
      this.db.query.bibleDocuments.findMany({
        columns: { section: true, slug: true, frontmatter: true },
        where: eq(schema.bibleDocuments.projectId, projectId),
        orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug],
      }),
      this.db.query.canonFacts.findMany({ columns: { factKey: true, disclosedInChapter: true }, where: eq(schema.canonFacts.projectId, projectId) }),
      this.db.query.worldFacts.findMany({
        columns: { category: true, key: true },
        where: eq(schema.worldFacts.projectId, projectId),
        orderBy: [schema.worldFacts.category, schema.worldFacts.key],
      }),
      this.db.query.milestones.findMany({
        columns: { milestoneKey: true, label: true, state: true },
        where: eq(schema.milestones.projectId, projectId),
        orderBy: schema.milestones.milestoneKey,
      }),
      this.db.query.chapters.findMany({ columns: { number: true, title: true, status: true, summary: true, isolated: true }, where: eq(schema.chapters.projectId, projectId) }),
      this.db.query.drafts.findMany({
        columns: { chapter: true, title: true, reviewStatus: true, summary: true, isolated: true, staleReason: true },
        where: eq(schema.drafts.projectId, projectId),
      }),
      this.db.query.briefs.findMany({ columns: { chapter: true }, where: eq(schema.briefs.projectId, projectId) }),
    ]);
    const chatBridges = await loadIsolationBridges(this.db, projectId, [...storedChapters.map(row => ({ chapter: row.number, isolated: row.isolated })), ...storedDrafts]);
    const chapters = storedChapters.map(row => walledOff(row, chatBridges.get(row.number)));
    const drafts = storedDrafts.map(row => walledOff(row, chatBridges.get(row.chapter)));
    const next = nextChapterNumber(chapters, drafts);
    const [handoffBriefs, pipelineStatus, changed] = await Promise.all([
      this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), inArray(schema.briefs.chapter, [next - 1, next])) }),
      this.renderPipelineStatus(projectId, project?.storyCurrentChapter ?? 0),
      this.changedSince(projectId, sessionStartedAt),
    ]);

    const caps = NOVEL_CHAT_SECTION_CAPS;
    const section = (key: string, content: string, tier: ContextTier, cap: number, rank: { required: true } | { priority: number }): ContextSection => ({
      ...fitToCap(makeSection(key, content, tier), cap),
      ...rank,
    });
    const stable: ContextSection[] = [];
    if (project) {
      const story = { ...project, authorInstructions: writingInstructionAdditions(project.instructions) || null };
      stable.push(section('story', renderNovelStory(story), 'canonical', caps.story, { required: true }));
    }
    stable.push(section('notebook', renderNotebook(await withoutLapsedRejections(this.db, projectId, ledger)), 'approved_intent', caps.notebook, { required: true }));
    const notesPointer = renderNotesPointer(ledger.find(entry => entry.topic === AUTHOR_BRIEF_TOPIC)?.statement ?? '');
    if (notesPointer) stable.push(section('author_notes', notesPointer, 'approved_intent', caps.authorNotes, { required: true }));
    if (volumes.length > 0) stable.push(section('volume_plan', renderVolumeGoals(volumes), 'approved_intent', caps.volumes, { priority: 0 }));
    const milestoneStates = new Map(milestones.map(milestone => [milestone.milestoneKey, milestone.state]));
    const volumeStates = new Map(volumes.map(volume => [volume.volumeKey, volume.state]));
    const promises = renderPromises(threads, mysteries, next, milestoneStates, volumeStates);
    if (promises) stable.push(section('promises', promises, 'canonical', caps.promises, { priority: 1 }));
    const inventory = renderInventory({ entities, pages, facts, worldFacts, milestones });
    if (inventory) stable.push(section('inventory', inventory, 'canonical', caps.inventory, { priority: 2 }));
    const chapterIndex = renderChapterIndex(
      chapters,
      drafts,
      plannedBriefs.map(brief => brief.chapter),
    );
    if (chapterIndex) stable.push(section('chapter_index', chapterIndex, 'canonical', caps.chapterIndex, { priority: 3 }));

    const volatile = [section('handoff', renderHandoff(chapters, drafts, handoffBriefs), 'working', caps.handoff, { required: true })];
    volatile.push(section('pipeline_status', pipelineStatus, 'working', caps.changedSince, { priority: 0 }));
    if (changed.length > 0) volatile.push(section('changed_since', changed.join('\n'), 'working', caps.changedSince, { priority: 1 }));
    if (project) {
      const nextBrief = handoffBriefs.find(brief => brief.chapter === next);
      const overrides = progressOverridesFrom(ledger);
      const fields = progressFieldsFrom(project, volumes, { chapter: next, brief: nextBrief ? { staleReason: nextBrief.staleReason } : undefined });
      const progress = computeProgress(fields, overrides);
      const progressText = renderProgress(progress);
      if (progressText) volatile.push(section('progress', progressText, 'working', caps.progress, { priority: 2 }));
    }
    const plugins = pluginContextSections(opts.policy, [...stable, ...volatile]).map(plugin => ({ ...plugin, segment: 'volatile' as const }));

    const stableRoom = Math.max(NOVEL_CHAT_PACK_FLOOR, NOVEL_CHAT_REQUEST_BUDGET - opts.promptTokens - NOVEL_CHAT_HISTORY_ALLOWANCE) - NOVEL_CHAT_PACK_MARGIN;
    const kept = applyBudget(stable.map(asStable), stableRoom);
    const packRoom = Math.max(NOVEL_CHAT_PACK_FLOOR, NOVEL_CHAT_REQUEST_BUDGET - opts.promptTokens - opts.requestTokens) - NOVEL_CHAT_PACK_MARGIN;
    const pinned = kept.fitting.map(fitting => ({ ...fitting, required: true }));
    return this.finalize(projectId, 'chat_hub', null, [...pinned, ...volatile, ...plugins], [], Math.max(sumTokens(kept.fitting), packRoom), { ...opts, omitted: kept.omitted });
  }

  /** The live production picture the hub reasons over: cursor, draft states, stale plans, open work. */
  private async renderPipelineStatus(projectId: bigint, storyCurrentChapter: number): Promise<string> {
    const [drafts, staleBriefs, pendingProposals, openJobs] = await Promise.all([
      this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: schema.drafts.chapter }),
      this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), isNotNull(schema.briefs.staleReason)) }),
      this.db.$count(schema.refinementProposals, and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.status, 'pending'))),
      this.db.$count(schema.jobs, and(eq(schema.jobs.projectId, projectId), inArray(schema.jobs.status, ['pending', 'in_progress']))),
    ]);

    const byReview = new Map<string, number[]>();
    for (const draft of drafts) {
      if (!byReview.has(draft.reviewStatus)) byReview.set(draft.reviewStatus, []);
      byReview.get(draft.reviewStatus)?.push(draft.chapter);
    }
    const lines = [
      `Story cursor (last finalized chapter): ${storyCurrentChapter}`,
      drafts.length > 0 ? `Drafts: ${[...byReview.entries()].map(([status, chapters]) => `${status} [${chapters.join(', ')}]`).join('; ')}` : 'Drafts: none yet',
    ];
    if (staleBriefs.length > 0) lines.push(`Stale briefs: chapters ${staleBriefs.map(b => b.chapter).join(', ')}`);
    if (pendingProposals > 0) lines.push(`Pending proposals awaiting review: ${pendingProposals}`);
    if (openJobs > 0) lines.push(`Jobs running or queued: ${openJobs}`);
    return lines.join('\n');
  }

  /** Pack for premise enhancement; the bible audit reuses it with a fuller document inventory. */
  async forPremise(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'premise', 1, opts?.budgetTokens ?? PREMISE_BUDGET, opts);
  }

  async forAudit(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'audit', 5, opts?.budgetTokens ?? AUDIT_BUDGET, opts);
  }

  /**
   * Pack for composing one image prompt. The art-style bible and the project premise are stable (they
   * bind every illustration in the project); the subject card and the canon that describes how the
   * subject looks are volatile. `subjectKey` is the entity key, the chapter number as text, or null
   * for the project cover. Reader-facing art reads only what the reader has by its chapter (P4-51): with `depiction`, every section passes
   * that policy's scrub, the art style and premise as copied pages, and an entity's changes stop at the chapter with its present-day status left out.
   */
  async forIllustration(
    projectId: bigint,
    subjectType: schema.Illustration.SubjectType,
    subjectKey: string | null,
    opts?: IllustrationPackOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const disclosure = opts?.depiction;
    const scrub = (text: string, field: WriterField): string => (disclosure ? disclosure.scrub(text, field) : text);
    const [project, artStyle] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.bibleDocuments.findFirst({
        where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, ART_STYLE_DOC.section), eq(schema.bibleDocuments.slug, ART_STYLE_DOC.slug)),
      }),
    ]);

    const sections: ContextSection[] = [];
    if (artStyle?.body) sections.push(asStable(makeSection('art_style', scrub(artStyle.body, 'bible_page'), 'canonical', [`doc:${ART_STYLE_DOC.section}/${ART_STYLE_DOC.slug}`])));
    if (project) {
      const premise = [project.title ? `Title: ${project.title}` : '', this.renderPremise(project)].filter(Boolean).join('\n\n');
      sections.push(asStable(makeSection('premise', scrub(premise, 'reference'), 'canonical', ['premise'])));
    }

    if (subjectType === 'entity' && subjectKey) sections.push(...(await this.entitySubjectSections(projectId, subjectKey, disclosure)));
    if (subjectType === 'chapter' && subjectKey) sections.push(...(await this.chapterSubjectSections(projectId, Number(subjectKey), disclosure)));

    const chapter = subjectType === 'chapter' && subjectKey ? Number(subjectKey) : subjectType === 'entity' ? (disclosure?.chapter ?? null) : null;
    return this.finalize(projectId, 'illustration', chapter, sections, [], ILLUSTRATION_BUDGET, { policy: opts?.policy, disclosure });
  }

  private async entitySubjectSections(projectId: bigint, entityKey: string, disclosure?: WriterDisclosurePolicy): Promise<ContextSection[]> {
    const entity = await this.db.query.entities.findFirst({
      where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)),
      with: { aliases: true },
    });
    if (!entity) return [];

    const scrub = (text: string, field: WriterField): string => (disclosure ? disclosure.scrub(text, field) : text);
    const heading = `${entity.name} (${entity.type}${entity.significance ? `, ${entity.significance}` : ''})`;
    const aliases = entity.aliases.length > 0 ? `Also known as: ${entity.aliases.map(a => a.alias).join(', ')}` : '';
    const card = (disclosure ? datedSubjectCard(entity, heading, aliases, disclosure.chapter) : presentSubjectCard(entity, heading, aliases)).filter(Boolean).join('\n');

    const sections = [makeSection('subject_card', scrub(card, 'entity'), 'canonical', [`entity:${entityKey}`])];

    if (disclosure) {
      const events = await this.db.query.characterEvents.findMany({
        where: and(
          eq(schema.characterEvents.projectId, projectId),
          eq(schema.characterEvents.entityId, entity.id),
          eq(schema.characterEvents.status, 'committed'),
          lte(schema.characterEvents.chapter, disclosure.chapter),
        ),
        orderBy: [schema.characterEvents.chapter, schema.characterEvents.createdAt],
      });
      const changes = renderEventsAsOf(events, disclosure.chapter, disclosure);
      if (changes) sections.push(makeSection('subject_changes', changes, 'canonical', [`entity:${entityKey}`]));
    }

    const facts = await this.db.query.worldFacts.findMany({
      where: eq(schema.worldFacts.projectId, projectId),
      orderBy: [schema.worldFacts.category, schema.worldFacts.key],
      limit: ILLUSTRATION_WORLD_FACTS_MAX,
    });
    if (facts.length > 0) sections.push(makeSection('world_facts', scrub(facts.map(f => `${f.category}/${f.key}: ${f.value}`).join('\n'), 'reference'), 'canonical', []));

    return sections;
  }

  private async chapterSubjectSections(projectId: bigint, chapter: number, disclosure?: WriterDisclosurePolicy): Promise<ContextSection[]> {
    const scrub = (text: string, field: WriterField): string => (disclosure ? disclosure.scrub(text, field) : text);
    const [chapterRow, appearances] = await Promise.all([
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)) }),
      this.db.query.entityAppearances.findMany({ where: and(eq(schema.entityAppearances.projectId, projectId), eq(schema.entityAppearances.chapter, chapter)) }),
    ]);
    if (!chapterRow) return [];
    const subject = walledOff(chapterRow, (await loadIsolationBridges(this.db, projectId, [{ chapter, isolated: chapterRow.isolated }])).get(chapter));

    const sections = [
      makeSection('subject_card', scrub([`Chapter ${chapter}: ${subject.title ?? ''}`, subject.summary ?? ''].filter(Boolean).join('\n\n'), 'reference'), 'canonical', [
        `chapter:${chapter}`,
      ]),
    ];

    const entityIds = appearances.map(a => a.entityId);
    if (entityIds.length === 0) return sections;

    const cast = await this.db.query.entities.findMany({ where: inArray(schema.entities.id, entityIds), orderBy: [schema.entities.name] });
    const rendered = cast.map(e => `${e.name} (${e.type}): ${e.appearance ?? 'no canonical appearance recorded'}`).join('\n');
    sections.push(
      makeSection(
        'cast_appearance',
        scrub(rendered, 'entity'),
        'canonical',
        cast.map(e => `entity:${e.entityKey}`),
      ),
    );

    return sections;
  }

  private async premisePack(
    projectId: bigint,
    purpose: ContextPurpose,
    inventoryLines: number,
    budgetTokens: number,
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const [project, docs] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
    ]);

    const sections: ContextSection[] = [];
    if (project) sections.push(asStable(makeSection('premise', this.renderPremise(project), 'canonical', ['premise'])));
    if (docs.length > 0) {
      const inventory = docs.map(d => `${d.section}/${d.slug}:\n${(d.body ?? '').split('\n').slice(0, inventoryLines).join('\n')}`).join('\n\n');
      sections.push(asStable(makeSection('doc_inventory', inventory, 'canonical', [])));
    }

    return this.finalize(projectId, purpose, null, sections, [], budgetTokens, opts);
  }

  private async changedSince(projectId: bigint, since: Date): Promise<string[]> {
    const [volumes, briefs, docs] = await Promise.all([
      this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), gt(schema.volumes.updatedAt, since)) }),
      this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), gt(schema.briefs.updatedAt, since)) }),
      this.db.query.bibleDocuments.findMany({ where: and(eq(schema.bibleDocuments.projectId, projectId), gt(schema.bibleDocuments.updatedAt, since)) }),
    ]);
    return [
      ...volumes.map(v => `volume:${v.volumeKey} is now at revision ${v.revision}`),
      ...briefs.map(b => `chapter:${b.chapter} brief is now at revision ${b.revision}`),
      ...docs.map(d => `doc:${d.section}/${d.slug} is now at revision ${d.revision}`),
    ];
  }

  private renderPremise(project: { premise: string | null; brief: string | null; themes: unknown; instructions: string | null }): string {
    const themes = Array.isArray(project.themes) ? (project.themes as string[]).join(', ') : '';
    const additions = writingInstructionAdditions(project.instructions);
    return [project.premise ?? project.brief ?? '', themes ? `Themes: ${themes}` : '', additions ? `Author instructions: ${additions}` : ''].filter(Boolean).join('\n\n');
  }

  private async volumeByKey(projectId: bigint, volumeKey: string | null | undefined): Promise<schema.Plan.Volume | undefined> {
    if (!volumeKey) return undefined;
    return this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)) });
  }

  private async finalize(
    projectId: bigint,
    purpose: ContextPurpose,
    chapter: number | null,
    sections: ContextSection[],
    unresolvedRefs: string[],
    budgetTokens: number,
    opts?: { dryRun?: boolean; policy?: ForgeCallPolicy; disclosure?: WriterDisclosurePolicy; withheldRefs?: string[]; omitted?: OmittedSection[] },
  ): Promise<AssembledPack & { id: bigint | null }> {
    const contributed = [...sections, ...pluginContextSections(opts?.policy, sections, opts?.disclosure)];
    const budgeted = applyBudget(contributed, budgetTokens);
    const fittingSections = budgeted.fitting;
    if (opts?.policy?.writerClass === 'permissive') {
      const hit = screenTexts(sectionScreens(fittingSections));
      if (hit) throw hardLineError(hit);
    }
    const omitted = [...(opts?.omitted ?? []), ...budgeted.omitted];
    // Stable sections render first so the prefix stays byte-identical across calls with unchanged
    // canon (the provider prompt-cache contract); callers list stable sections first, so for the
    // legacy all-volatile purposes this is a no-op.
    const stableSections = fittingSections.filter(s => s.segment === 'stable');
    const volatileSections = fittingSections.filter(s => s.segment !== 'stable');
    const { renderedStable, renderedVolatile } = splitSegments(fittingSections);
    const rendered = joinSections([...stableSections, ...volatileSections]);
    const usedTokens = fittingSections.reduce((sum, s) => sum + s.tokens, 0);
    const hash = createHash('sha256').update(rendered).digest('hex');

    let id: bigint | null = null;
    if (!opts?.dryRun) {
      const [inserted] = await this.db
        .insert(schema.contextPacks)
        .values({ projectId, purpose, chapter, hash, budgetTokens, usedTokens, sections: fittingSections as never, unresolvedRefs, omitted: omitted as never, rendered })
        .onConflictDoNothing()
        .returning({ id: schema.contextPacks.id });

      if (inserted) {
        id = inserted.id;
      } else {
        // Conflict: pack with this hash already exists — fetch existing id.
        const existing = await this.db.query.contextPacks.findFirst({ where: and(eq(schema.contextPacks.projectId, projectId), eq(schema.contextPacks.hash, hash)) });
        id = existing?.id ?? null;
      }
    }

    const withheldRefs = opts?.withheldRefs ?? [];
    return {
      projectId,
      purpose,
      chapter,
      budgetTokens,
      usedTokens,
      sections: fittingSections,
      unresolvedRefs,
      withheldRefs,
      omitted,
      renderedStable,
      renderedVolatile,
      rendered,
      id,
    };
  }
}
