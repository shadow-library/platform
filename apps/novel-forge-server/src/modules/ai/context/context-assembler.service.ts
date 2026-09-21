import { createHash } from 'node:crypto';

import { and, between, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import {
  type FactLike,
  loadKnowledgeView,
  loadWriterForbiddenFacts,
  loadWriterHiddenFactKeys,
  parseKnowledgeContract,
  renderChapterReveals,
  renderHiddenConstraints,
  renderKnownFacts,
  scanKnowledgeLeaks,
  scrubForWriter,
  withWriterNotes,
} from '../../bible/fact/knowledge-view';
import { matchPlaybooks } from '../../ideation/constraint-playbooks';
import { SEED_FIELD_KEYS } from '../../ideation/question-bank';
import { type RouterResult, toRouterSeedState } from '../../ideation/question-router';
import { type ForgeCallPolicy } from '../../plugins/plugin-policy.service';
import { DEFAULT_WRITING_INSTRUCTIONS } from '../prompts/authoring-preamble';
import { type RetrievalHit, RetrievalService } from '../retrieval';
import { type BibleDocRow, renderBibleDigest } from './bible-docs';
import { type CatalogOptions, CatalogService } from './catalog.service';
import { computeDormantThreads, renderDormantThreads } from './dormant-threads';
import { pluginContextSections } from './plugin-sections';
import {
  type AssembledPack,
  type ContextPurpose,
  type ContextSection,
  type ContextSegment,
  type ContextTier,
  joinSections,
  renderLabeledSection,
  renderSection,
  splitSegments,
} from './sections';
import { applyBudget, countTokens, truncateAtParagraph, truncateAtParagraphTail } from './token-budget';

export interface PackPolicyOptions {
  /** The policy of the roles that will read this pack, resolved ahead of assembly so the writer class is already fixed when sections are chosen. */
  policy?: ForgeCallPolicy;
}

export interface PackOptions extends PackPolicyOptions {
  budgetTokens?: number;
}

export interface ChapterPackOptions extends PackOptions {
  dryRun?: boolean;
}

export interface IdeationPackOptions extends ChapterPackOptions {
  /** Question ids the turn pipeline has decided must be settled this turn rather than asked again. */
  commitIds?: string[];
}

export type IdeationSeedInput = Pick<schema.Ideation.StorySeed, 'projectId' | 'fields' | 'constraints' | 'tasteAnchors' | 'concepts' | 'readiness' | 'askedQuestions'>;

export interface ChatScopeInput {
  scopeType: schema.Refinement.ChatScope;
  createdAt: Date;
}

export const DEFAULT_BUDGET = 24_000;
export const PREV_ENDING_TAIL = 500;
export const FULL_CAST_MAX = 5;
const RECENT_SUMMARY_COUNT = 3;
const ESTABLISHED_FACTS_MAX = 15;

// Refinement budgets. History is prompt messages, not pack text, so it does not count
// against the pack; the history budgets are enforced by ChatService compaction.
export const CHAT_HUB_BUDGET = 20_000;
export const CHAT_HISTORY_BUDGET = 6_000;
export const CHAT_SUMMARY_BUDGET = 1_500;
// Planning packs carry the whole catalog — every canon fact and a description per entity — plus, for arc planning, the governing
// bible documents, which take what the rest leaves up to their own cap. Both calls run once per arc or volume, not per chapter.
export const OUTLINE_BUDGET = 32_000;
export const ARC_PLAN_BUDGET = 32_000;
export const ARC_PLAN_BIBLE_BUDGET = 8_000;
export const ARC_PLAN_BIBLE_DOC_TOKENS = 2_500;
// The catalog's ceiling leaves the documents at least this much, so a long serial's catalog cannot squeeze them out entirely.
export const ARC_PLAN_BIBLE_FLOOR = 4_000;
// Held back for the uncached dormant-thread section, so the cached sections are sized from cached content alone and their cut
// points — and with them the provider cache prefix — do not move when a thread goes dormant.
export const ARC_PLAN_UNCACHED_RESERVE = 1_500;
// Token counts of a section's parts and of the rendered whole differ by a few tokens; the margin keeps a sized section inside the budget.
const SIZED_SECTION_MARGIN = 32;
export const PREMISE_BUDGET = 8_000;
export const AUDIT_BUDGET = 12_000;
export const REBRAND_SEED_BUDGET = 10_000;
export const REBRAND_BUDGET = 12_000;
// Translation carries no story canon into the call: the seed pack is the project overview and the
// known proper nouns, the chapter pack is the style notes, the term policy and the glossary slice.
export const TRANSLATE_SEED_BUDGET = 10_000;
export const TRANSLATE_BUDGET = 12_000;
// Reforge mirrors the rebrand chapter budget: the source prose (outline pack) and the outline (write
// pack) both travel as template vars, not pack sections, so the pack itself stays rebrand-sized.
export const REFORGE_OUTLINE_BUDGET = 12_000;
export const REFORGE_BUDGET = 12_000;
// The analysis window's chapters and the synthesis card index both travel as template vars, so the pack
// only carries the rename bible, the window's signal digest, and the carry-forward state.
export const REFORGE_ANALYSIS_BUDGET = 12_000;
// A transform write carries the span's plan contract and the cut ledger on top of a reforge pack; the
// span's source prose still travels as a template var.
export const REFORGE_TRANSFORM_BUDGET = 16_000;
// An image prompt is a paragraph: the composer needs the subject, the look, and nothing else.
// The studio turn IS the authoring session: every answer the author gave must reach the model in their
// own words, because every later step of the novel is derived from them — so the seed pack gets far
// more headroom than a scoped chat turn.
export const IDEATION_BUDGET = 32_000;
// The conversation is never packed: it reaches the model as prompt messages through the template's
// `history` placeholder, so this budget caps that message list at the turn pipeline, not the pack.
export const IDEATION_HISTORY_BUDGET = 10_000;
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

function makeCappedSection(key: string, content: string, maxTokens: number, tier: ContextTier): ContextSection {
  const { text, truncated } = truncateAtParagraph(content, maxTokens);
  return { ...makeSection(key, text, tier), truncated };
}

function asStable(section: ContextSection): ContextSection {
  return { ...section, segment: 'stable' };
}

export const ENTITY_CARD_BUDGET = 800;
// Writing style is reserved ahead of every other section, so an oversized instructions text must not be
// able to claim the budget the rest of the pack needs.
export const WRITING_STYLE_BUDGET = 4_000;

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

/** `maxTokens` omitted renders the entity's body in full and in its authored order — reserved for the POV character's card. */
function renderEntityCard(entity: EntityCardRow, maxTokens?: number): RenderedCard {
  const aliasLine = entity.aliases.length > 0 ? `\nAliases: ${entity.aliases.map(a => a.alias).join(', ')}` : '';
  const statusLine = entity.status != null ? `\nStatus: ${entity.status}` : '';
  const bodyRaw = entity.body ?? entity.notes ?? '';
  const overBudget = maxTokens !== undefined && countTokens(bodyRaw) > maxTokens;
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
  arcMap: Map<string, ArcRow>;
  bibleDocMap: Map<string, typeof schema.bibleDocuments.$inferSelect>;
  factMap: Map<string, CanonFactRow>;
  hiddenFactKeys: ReadonlySet<string> | null;
  forbidden: FactLike[];
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

type ArcRow = typeof schema.arcs.$inferSelect;
type ArcTiming = 'written' | 'current' | 'upcoming';

// Without a chapter to measure against, only a source arc is known to be on the page already; anything
// else is treated as upcoming, the reading that can never hand the drafter an ending early.
function arcTiming(arc: ArcRow, chapter?: number): ArcTiming {
  if (arc.status === 'source') return 'written';
  if (chapter === undefined || arc.chapterStart == null || arc.chapterEnd == null) return 'upcoming';
  if (arc.chapterEnd < chapter) return 'written';
  return arc.chapterStart <= chapter ? 'current' : 'upcoming';
}

// Payoff is the arc's ending: it reaches the drafter only once written. The current arc gets what the
// arc-objective section gives it, and an upcoming arc only its objective and cast.
function renderArcRef(arc: ArcRow, chapter?: number): string {
  const timing = arcTiming(arc, chapter);
  const cast = arc.cast && arc.cast.length > 0 ? `Cast: ${arc.cast.join(', ')}` : '';
  return [
    `**${arc.title ?? arc.arcKey}** (${arc.arcKey}, ${arc.status}, chs ${arc.chapterStart ?? '?'}–${arc.chapterEnd ?? '?'}, ${timing})`,
    arc.objective ? `Objective: ${arc.objective}` : '',
    timing !== 'upcoming' && arc.escalation ? `Escalation: ${arc.escalation}` : '',
    timing === 'written' && arc.payoff ? `Payoff: ${arc.payoff}` : '',
    timing !== 'upcoming' && arc.hook ? `Hook: ${arc.hook}` : '',
    cast,
  ]
    .filter(Boolean)
    .join('\n');
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

function castKeys(cast: unknown): string[] {
  return Array.isArray(cast) ? cast.filter((key): key is string => typeof key === 'string') : [];
}

function firstLine(text: string | null): string {
  return (text ?? '').split('\n', 1)[0] ?? '';
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
}

// A batch drafts chapter N before N-1 is finalized, so a chapter without a finalized row speaks through its draft's summary.
function recentSummaries(finalized: { number: number; summary: string | null }[], drafts: { chapter: number; summary: string | null }[]): RecentSummary[] {
  const byChapter = new Map<number, RecentSummary>();
  for (const draft of drafts) if (draft.summary?.trim()) byChapter.set(draft.chapter, { chapter: draft.chapter, summary: draft.summary, draft: true });
  for (const row of finalized) {
    const summary = row.summary?.trim() ? row.summary : (byChapter.get(row.number)?.summary ?? '');
    byChapter.set(row.number, { chapter: row.number, summary, draft: false });
  }
  return [...byChapter.values()].sort((a, b) => a.chapter - b.chapter).slice(-RECENT_SUMMARY_COUNT);
}

// Each value is scrubbed before serializing: scrubbing the JSON text would miss a fact whose quotes or line breaks the encoding escapes.
function writerSafeState(value: unknown, forbidden: FactLike[]): unknown {
  if (typeof value === 'string') return scrubForWriter(value, forbidden);
  if (Array.isArray(value)) return value.map(item => writerSafeState(item, forbidden));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, key === 'establishedFacts' && Array.isArray(item) ? writerSafeFacts(item, forbidden) : writerSafeState(item, forbidden)]),
  );
}

// An entry tripping a hidden fact's tell-tale terms is dropped outright rather than scrubbed around, so the ledger never carries half a secret forward.
function writerSafeFacts(entries: unknown[], forbidden: FactLike[]): string[] {
  return entries
    .filter((entry): entry is string => typeof entry === 'string' && scanKnowledgeLeaks(entry, forbidden).length === 0)
    .slice(0, ESTABLISHED_FACTS_MAX)
    .map(entry => scrubForWriter(entry, forbidden));
}

function renderCarriedState(state: unknown, forbidden: FactLike[]): string {
  return typeof state === 'string' ? scrubForWriter(state, forbidden) : JSON.stringify(writerSafeState(state, forbidden));
}

function renderIsolatedEnding(summary: string | null, state: unknown, forbidden: FactLike[]): string {
  return `Summary: ${scrubForWriter(summary ?? '', forbidden)}\nState: ${state ? renderCarriedState(state, forbidden) : 'null'}`;
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

/** Every sheet field in a fixed order, empty ones included — the model must see what is still open. */
function renderSeedSheet(fields: schema.Ideation.SeedFields): string {
  return SEED_FIELD_KEYS.map(key => {
    const value = fields[key];
    const text = Array.isArray(value) ? value.join(', ') : (value ?? '');
    return `${key}: ${text.trim() === '' ? '(empty)' : text}`;
  }).join('\n');
}

// Sorted by key — as are the playbook excerpts derived from it — so re-locking an existing constraint,
// or the column coming back in a different order, cannot reshuffle the stable segment and throw away the
// prompt cache for a sheet that has not actually changed.
function renderSeedConstraints(constraints: schema.Ideation.SeedConstraint[]): string {
  return [...constraints]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(c => `- ${c.key} (${c.kind}, locked by ${c.lockedBy}${c.playbookKey ? `, playbook ${c.playbookKey}` : ''}): ${c.text}`)
    .join('\n');
}

function renderTasteAnchors(anchors: schema.Ideation.TasteAnchors): string {
  const lines: string[] = [];
  if (anchors.comps.length > 0) lines.push(`Comps: ${anchors.comps.join(' | ')}`);
  if (anchors.preferences.length > 0) lines.push(`What those comps have in common: ${anchors.preferences.join(' | ')}`);
  return lines.join('\n');
}

/** One excerpt per matched playbook — what the shape promises, what it removes, and what must carry the load. */
function renderPlaybookExcerpts(constraints: schema.Ideation.SeedConstraint[]): string {
  const { matched } = matchPlaybooks(constraints);
  const byKey = new Map(matched.map(({ playbook }) => [playbook.key, playbook]));
  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, playbook]) => `**${key}**\nPromises: ${playbook.promises}\nKills: ${playbook.kills}\nMust replace: ${playbook.mustReplace}`)
    .join('\n\n');
}

function renderRoundQuestions(router: RouterResult, commitIds: string[]): string {
  const header = router.done
    ? `Stage: ${router.stage}. Every stress-ready field is filled — the author can start the novel whenever they want, and should hear that.`
    : `Stage: ${router.stage}.`;
  if (router.questions.length === 0) return `${header}\n\nNo questions this round: there is nothing left to ask. Answer the author in prose and return an empty payload.questions.`;

  const backfilled = new Set(router.backfilled);
  const commit = new Set(commitIds);
  const blocks = router.questions.map(question => {
    const lines = [
      `[${question.id}] fills: ${question.fills.length > 0 ? question.fills.join(', ') : 'nothing — this answer is a locked constraint'}`,
      `Select: ${question.select} — ${question.select === 'many' ? 'options must be independently selectable, never mutually exclusive' : 'options are mutually exclusive alternatives'}`,
      `Intent: ${question.intent}`,
      `Coaching (reproduce verbatim): ${question.coaching}`,
    ];
    const hint = router.hints[question.id];
    if (hint) lines.push(`HINT — already settled: ${hint}. Confirm it instead of asking again.`);
    if (backfilled.has(question.id)) lines.push('CIRCLING BACK — this was offered before and left unanswered. Say so, make it easier, lead with your own answer.');
    if (commit.has(question.id))
      lines.push(
        "COMMIT NOW — the author has passed on this three times running. Stop asking: take the youDecide answer yourself, record it in the changeSet under this question's emission contract, and tell them in one line what you committed to and why they can overturn it whenever they like.",
      );
    return lines.join('\n');
  });
  return [header, ...blocks].join('\n\n');
}

/** Prior rounds with their fates — the killed mechanisms the next round may not resurrect. */
function renderConceptHistory(concepts: schema.Ideation.ConceptCard[]): string {
  return concepts
    .map(
      card =>
        `Round ${card.round} — ${card.title} [${card.fate}]${card.reason ? `: ${card.reason}` : ''}\n  ${card.logline}\n  engine: ${card.engine} | ladder: ${card.ladder} | posture: ${card.posture}`,
    )
    .join('\n\n');
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

  catalog(projectId: bigint, options?: CatalogOptions): Promise<string> {
    return this.catalogService.render(projectId, options);
  }

  /** `chapter` is the chapter the refs are resolved for; it decides which arc payoffs are already on the page. */
  async resolveRefs(projectId: bigint, refs: string[], chapter?: number): Promise<{ resolved: ContextSection[]; unresolved: string[] }> {
    const uniqueRefs = [...new Set(refs)];
    const entityKeys: string[] = [];
    const worldFactValues: string[] = [];
    const threadKeys: string[] = [];
    const mysteryKeys: string[] = [];
    const chapterNumbers: number[] = [];
    const volumeKeys: string[] = [];
    const arcKeys: string[] = [];
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
        case 'arc':
          arcKeys.push(value);
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
    const [entitiesRows, worldFactRows, threadRows, mysteryRows, chapterRows, volumeRows, arcRows, bibleDocRows, factRows] = await Promise.all([
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
      arcKeys.length > 0 ? this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), inArray(schema.arcs.arcKey, arcKeys)) }) : [],
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
    const arcMap = new Map(arcRows.map(a => [a.arcKey, a]));
    const bibleDocMap = new Map(bibleDocRows.map(d => [`${d.section}/${d.slug}`, d]));
    const factMap = new Map(factRows.map(f => [f.factKey, f]));
    const hiddenFactKeys = chapter !== undefined && factRows.length > 0 ? await loadWriterHiddenFactKeys(this.db, projectId, chapter, factRows) : null;
    const forbidden = chapter !== undefined && chapterRows.length > 0 ? await loadWriterForbiddenFacts(this.db, projectId, chapter) : [];

    const resolved: ContextSection[] = [];
    const unresolved: string[] = [];

    for (const ref of uniqueRefs) {
      const colon = ref.indexOf(':');
      const prefix = colon === -1 ? '' : ref.slice(0, colon);
      const value = ref.slice(colon + 1);
      if (prefix === 'fact' && hiddenFactKeys?.has(value) && !factMap.get(value)?.writerNote?.trim()) continue;
      const rows = { entityMap, worldFactRows, threadMap, mysteryMap, chapterMap, volumeMap, arcMap, bibleDocMap, factMap, hiddenFactKeys, forbidden };
      const section = this.resolveRef(ref, prefix, value, chapter, rows);
      if (section) resolved.push(section);
      else unresolved.push(ref);
    }

    return { resolved, unresolved };
  }

  /**
   * Sanitizes a model-written `requiredContext`: drops refs that resolve to nothing and every `fact:` ref, because an
   * outliner reading the catalog sees hidden facts in full and must never pin one into a chapter's context.
   */
  async sanitizeOutlinedRefs(projectId: bigint, refs: string[]): Promise<{ kept: string[]; dropped: string[] }> {
    const candidates = refs.filter(ref => !ref.startsWith('fact:'));
    const { unresolved } = candidates.length > 0 ? await this.resolveRefs(projectId, candidates) : { unresolved: [] };
    const unresolvedSet = new Set(unresolved);
    const kept = candidates.filter(ref => !unresolvedSet.has(ref));
    const keptSet = new Set(kept);
    return { kept, dropped: refs.filter(ref => !keptSet.has(ref)) };
  }

  private resolveRef(ref: string, prefix: string, value: string, chapter: number | undefined, rows: ResolvedRefRows): ContextSection | null {
    switch (prefix) {
      case 'entity': {
        const entity = rows.entityMap.get(value);
        if (!entity) return null;
        const card = renderEntityCard(entity, ENTITY_CARD_BUDGET);
        return makeRefSection(ref, entityLabel(entity), card.text, entityCardTier(entity.status), card.truncated);
      }
      case 'world_fact': {
        const match = matchWorldFacts(rows.worldFactRows, value);
        if (!match) return null;
        const lines = match.facts.map(f => `${match.byKey ? `${f.category}/` : ''}${f.key}: ${truncateAtParagraph(f.value, 150).text}`);
        return makeRefSection(ref, `WORLD FACTS: ${value}`, lines.join('\n'), 'canonical');
      }
      case 'thread': {
        const thread = rows.threadMap.get(value);
        if (!thread) return null;
        const content = `**${thread.threadKey}** (${thread.status}, ch ${thread.openedChapter ?? '?'}–${thread.closedChapter ?? '?'})\n${thread.summary ?? ''}`;
        return makeRefSection(ref, `PLOT THREAD: ${thread.threadKey}`, content, 'canonical');
      }
      case 'mystery': {
        const mystery = rows.mysteryMap.get(value);
        if (!mystery) return null;
        const content = `**${mystery.mysteryKey}** (${mystery.status}, ch ${mystery.openedChapter ?? '?'})\n${mystery.question}`;
        return makeRefSection(ref, `MYSTERY: ${mystery.mysteryKey}`, content, 'canonical');
      }
      case 'chapter': {
        const n = parseInt(value, 10);
        const chapter = rows.chapterMap.get(n);
        if (!chapter) return null;
        const isDraft = chapter.status !== 'done';
        const content = `${isDraft ? '[DRAFT — not yet canon] ' : ''}Ch ${n}: ${scrubForWriter(chapter.summary ?? '', rows.forbidden)}`;
        return makeRefSection(ref, `EARLIER CHAPTER: ${n}${chapter.title ? ` — ${chapter.title}` : ''}`, content, isDraft ? 'working' : 'canonical');
      }
      case 'volume': {
        const volume = rows.volumeMap.get(value);
        if (!volume) return null;
        const tier: ContextTier = volume.status === 'source' ? 'canonical' : 'approved_intent';
        const content = `**${volume.title ?? volume.volumeKey}** (${volume.status})\nObjective: ${volume.objective ?? ''}\nChs ${volume.startChapter ?? '?'}–${volume.endChapter ?? '?'}`;
        return makeRefSection(ref, `VOLUME: ${volume.title ?? volume.volumeKey}`, content, tier);
      }
      case 'arc': {
        const arc = rows.arcMap.get(value);
        if (!arc) return null;
        const tier: ContextTier = arc.status === 'source' ? 'canonical' : 'approved_intent';
        return makeRefSection(ref, `ARC: ${arc.title ?? arc.arcKey}`, renderArcRef(arc, chapter), tier);
      }
      case 'bible_doc': {
        const doc = rows.bibleDocMap.get(value.includes('/') ? value : `${value}/`);
        if (!doc?.body) return null;
        const { text: body, truncated } = truncateAtParagraph(doc.body, 8_000);
        return makeRefSection(ref, `BIBLE: ${doc.section}/${doc.slug}`, body, 'canonical', truncated);
      }
      case 'fact': {
        const fact = rows.factMap.get(value);
        if (!fact) return null;
        if (rows.hiddenFactKeys?.has(fact.factKey)) return makeRefSection(ref, 'WRITING CONSTRAINT', fact.writerNote?.trim() ?? '', 'approved_intent');
        if (rows.hiddenFactKeys) return makeRefSection(ref, `CANON FACT: ${fact.factKey}`, `**${fact.factKey}**: ${fact.text}`, 'canonical');
        const constraintLine = fact.constraintNote ? `\nConstraint: ${fact.constraintNote}` : '';
        return makeRefSection(ref, `CANON FACT: ${fact.factKey}`, `**${fact.factKey}**: ${fact.text}${constraintLine}`, 'canonical');
      }
      default:
        return null;
    }
  }

  async forChapter(projectId: bigint, chapter: number, opts?: ChapterPackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? DEFAULT_BUDGET;

    const [project, brief, prevChapter, currentVolume, recentChapters, recentDrafts, prevDraft] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter - 1)) }),
      this.db.query.volumes.findFirst({
        where: and(
          eq(schema.volumes.projectId, projectId),
          lte(schema.volumes.startChapter, chapter),
          or(sql`${schema.volumes.endChapter} >= ${chapter}`, isNull(schema.volumes.endChapter)),
        ),
        orderBy: schema.volumes.ordinal,
      }),
      this.db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), sql`${schema.chapters.number} < ${chapter}`, eq(schema.chapters.status, 'done')),
        orderBy: sql`${schema.chapters.number} DESC`,
        limit: RECENT_SUMMARY_COUNT,
        columns: { number: true, summary: true },
      }),
      this.db.query.drafts.findMany({
        where: and(eq(schema.drafts.projectId, projectId), between(schema.drafts.chapter, chapter - RECENT_SUMMARY_COUNT, chapter - 1)),
        columns: { chapter: true, summary: true },
      }),
      this.db.query.drafts.findFirst({
        where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter - 1)),
        columns: { body: true, summary: true, state: true, isolated: true },
      }),
    ]);

    const carried = prevChapter != null || prevDraft != null || recentDrafts.some(draft => draft.summary) || recentChapters.length > 0;
    const forbidden = carried ? await loadWriterForbiddenFacts(this.db, projectId, chapter) : [];

    const currentArc = brief?.arcKey ? await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, brief.arcKey)) }) : undefined;

    const sections: ContextSection[] = [];

    if (prevChapter) {
      const isIsolated = prevChapter.isolated;
      const isFinal = prevChapter.status === 'done';
      const tier: ContextTier = isFinal ? 'canonical' : 'working';
      if (isIsolated) {
        sections.push(makeSection('prev_ending', renderIsolatedEnding(prevChapter.summary, prevDraft?.state, forbidden), tier, [`chapter:${chapter - 1}`]));
      } else {
        const raw = scrubForWriter(prevChapter.content ?? '', forbidden);
        sections.push(makeSectionTail('prev_ending', raw, PREV_ENDING_TAIL, tier, [`chapter:${chapter - 1}`]));
      }
    } else if (prevDraft?.isolated) {
      sections.push(
        makeSection('prev_ending', `[DRAFT — not yet canon]\n${renderIsolatedEnding(prevDraft.summary, prevDraft.state, forbidden)}`, 'working', [`chapter:${chapter - 1}`]),
      );
    } else if (prevDraft?.body) {
      // Chapter N-1 hasn't been finalized yet (mid-batch): the `chapters` row doesn't exist, so fall back
      // to the just-drafted prose tail instead of leaving chapter N with only continuation-state fields.
      const { text, truncated } = truncateAtParagraphTail(scrubForWriter(prevDraft.body, forbidden), PREV_ENDING_TAIL);
      const content = `[DRAFT — not yet canon]\n${text}`;
      const rendered = renderSection('prev_ending', content);
      sections.push({ key: 'prev_ending', tier: 'working', segment: 'volatile', tokens: countTokens(rendered), truncated, sourceRefs: [`chapter:${chapter - 1}`], rendered });
    }

    const prevState = prevDraft?.state;
    if (prevState != null) sections.push(makeSection('continuation_state', renderCarriedState(prevState, forbidden), 'working', [`chapter:${chapter - 1}`]));

    if (currentVolume) {
      const content = [currentVolume.objective, currentVolume.conflict].filter(Boolean).join('\n');
      sections.push(asStable(makeSection('volume_objective', content, 'approved_intent', [`volume:${currentVolume.volumeKey}`])));
    }

    if (currentArc) {
      const content = [currentArc.objective, currentArc.escalation, currentArc.hook].filter(Boolean).join('\n');
      if (content) sections.push(asStable(makeSection('arc_objective', content, 'approved_intent', [`arc:${currentArc.arcKey}`])));
    }

    // Only the POV cast's ledgered facts enter the drafting pack; still-hidden facts surface as their writer
    // notes, never as text. Absent a contract the feature is off and nothing changes. With a contract
    // the known-facts section is always present, so a cast that knows nothing is told so rather than left
    // to infer it from a missing heading.
    const knowledgeContract = parseKnowledgeContract(brief?.knowledgeContract);
    if (knowledgeContract) {
      const view = await loadKnowledgeView(this.db, projectId, chapter, knowledgeContract);
      sections.push(
        makeSection(
          'known_facts',
          renderKnownFacts(view.known),
          'canonical',
          view.known.map(f => `fact:${f.factKey}`),
        ),
      );
      if (view.reveals.length > 0) {
        sections.push(
          makeSection(
            'chapter_reveals',
            renderChapterReveals(view.reveals),
            'approved_intent',
            view.reveals.map(f => `fact:${f.factKey}`),
          ),
        );
      }
      const constraints = renderHiddenConstraints(view.hidden);
      if (constraints) {
        sections.push(
          makeSection(
            'hidden_constraints',
            constraints,
            'approved_intent',
            withWriterNotes(view.hidden).map(f => `fact:${f.factKey}`),
          ),
        );
      }
    }

    const contextRefs = Array.isArray(brief?.contextRefs) ? (brief.contextRefs as string[]) : [];
    let unresolvedRefs: string[] = [];
    let refSections: ContextSection[] = [];

    if (contextRefs.length > 0) {
      const { resolved, unresolved } = await this.resolveRefs(projectId, contextRefs, chapter);
      const constrained = new Set(sections.find(s => s.key === 'hidden_constraints')?.sourceRefs ?? []);
      unresolvedRefs = unresolved;
      refSections = resolved.filter(section => !section.sourceRefs.some(ref => constrained.has(ref)));
    }

    const pov = brief?.pov ?? null;
    const povSection = pov ? await this.povEntitySection(projectId, pov) : null;
    if (pov && !povSection && !unresolvedRefs.includes(`entity:${pov}`)) unresolvedRefs = [...unresolvedRefs, `entity:${pov}`];

    // Only the first FULL_CAST_MAX entity refs retain caller-requested priority; the rest move below memory
    // and style. The POV card leads that slice — whose head the chapter is in outranks every other card,
    // and the outliner does not always remember to list it in contextRefs at all.
    const resolvedEntitySections = refSections.filter(s => s.key.startsWith('ref:entity:'));
    const entityRefSections = povSection ? [povSection, ...resolvedEntitySections.filter(s => s.key !== povSection.key)] : resolvedEntitySections;
    const hasArcObjective = sections.some(s => s.key === 'arc_objective');
    const nonEntityRefSections = refSections.filter(s => !s.key.startsWith('ref:entity:') && !(hasArcObjective && s.key === `ref:arc:${currentArc?.arcKey}`));
    const priorityEntitySections = entityRefSections.slice(0, FULL_CAST_MAX).map(asStable);
    const excessEntitySections = entityRefSections.slice(FULL_CAST_MAX).map(asStable);

    for (const s of [...priorityEntitySections, ...nonEntityRefSections.map(asStable)]) sections.push(s);

    for (const s of await this.dynamicCastSections(projectId, entityRefSections, brief?.pov ?? null)) sections.push(s);

    const recent = recentSummaries(recentChapters, recentDrafts);
    if (recent.length > 0) {
      const lines = recent.map((entry, i) => `${i + 1}. ${entry.draft ? '[DRAFT — not yet canon] ' : ''}Ch ${entry.chapter}: ${entry.summary}`);
      const tier: ContextTier = recent.some(entry => entry.draft) ? 'working' : 'canonical';
      sections.push(makeSection('memory', scrubForWriter(lines.join('\n'), forbidden), tier, []));
    }

    // Writing style is the generator's only source for voice, craft, and length, so it is required: the
    // budget reserves it before the refs listed ahead of it can crowd it out.
    sections.push({
      ...asStable(makeCappedSection('writing_style', project?.instructions?.trim() || DEFAULT_WRITING_INSTRUCTIONS, WRITING_STYLE_BUDGET, 'canonical')),
      required: true,
    });

    for (const s of excessEntitySections) sections.push(s);

    const pack = await this.finalize(projectId, 'generation', chapter, sections, unresolvedRefs, budgetTokens, opts);
    const excessKeys = new Set(excessEntitySections.map(s => s.key));
    const omitted = pack.omitted.filter(o => !excessKeys.has(o.key)).map(o => o.key);
    if (!opts?.dryRun && (pack.unresolvedRefs.length > 0 || omitted.length > 0))
      this.logger.warn('chapter pack dropped context', { projectId, chapter, unresolvedRefs: pack.unresolvedRefs, omitted });
    return pack;
  }

  // The POV character's card is the one entity card that never pays the shared ENTITY_CARD_BUDGET cap: the
  // drafter writes from inside this head, so a truncated card is a truncated narrator.
  private async povEntitySection(projectId: bigint, pov: string): Promise<ContextSection | null> {
    const entity = await this.db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, pov)), with: { aliases: true } });
    if (!entity) return null;
    return makeRefSection(`entity:${pov}`, entityLabel(entity, true), renderEntityCard(entity).text, entityCardTier(entity.status));
  }

  // Per-chapter dynamic state — never stable, and never project-wide: it is scoped to the cast the brief
  // already named plus its POV, so a hundred-character project still pays for only the characters on stage.
  private async dynamicCastSections(projectId: bigint, entityRefSections: ContextSection[], pov: string | null): Promise<ContextSection[]> {
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
          blocks.join('\n\n'),
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
      sections.push(makeSection('relationships', lines.join('\n'), 'working', refs));
    }

    return sections;
  }

  async forOutline(projectId: bigint, chapter: number, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? OUTLINE_BUDGET;

    const [currentVolume, recentChapters, prevVolumes, currentArc] = await Promise.all([
      this.db.query.volumes.findFirst({
        where: and(
          eq(schema.volumes.projectId, projectId),
          lte(schema.volumes.startChapter, chapter),
          or(sql`${schema.volumes.endChapter} >= ${chapter}`, isNull(schema.volumes.endChapter)),
        ),
        orderBy: schema.volumes.ordinal,
      }),
      this.db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), sql`${schema.chapters.number} < ${chapter}`, eq(schema.chapters.status, 'done')),
        orderBy: sql`${schema.chapters.number} DESC`,
        limit: 3,
      }),
      this.db.query.volumes.findMany({
        where: and(eq(schema.volumes.projectId, projectId), sql`${schema.volumes.endChapter} < ${chapter}`),
        orderBy: schema.volumes.ordinal,
      }),
      this.db.query.arcs.findFirst({
        where: and(eq(schema.arcs.projectId, projectId), lte(schema.arcs.chapterStart, chapter), gte(schema.arcs.chapterEnd, chapter)),
        orderBy: schema.arcs.ordinal,
      }),
    ]);

    const sections: ContextSection[] = [];

    if (currentVolume) {
      const parts = [currentVolume.objective, currentVolume.conflict, currentVolume.payoff].filter(Boolean);
      sections.push({ ...makeSection('volume_objective', parts.join('\n'), 'approved_intent', [`volume:${currentVolume.volumeKey}`]), required: true });
    }

    const memoryParts: string[] = [];
    for (const v of prevVolumes) {
      if (v.epitome) memoryParts.push(`Vol ${v.ordinal} (${v.title ?? v.volumeKey}): ${v.epitome}`);
    }
    const recentLines = recentChapters
      .slice()
      .reverse()
      .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
    memoryParts.push(...recentLines);
    if (memoryParts.length > 0) {
      sections.push({ ...makeSection('memory', memoryParts.join('\n'), 'canonical', []), required: true });
    }

    // The outliner may only cite what the catalog lists, so retrieval gives way to it under budget pressure; the catalog's ceiling is
    // what the other required sections leave, so none of them can be crowded out.
    const focusEntityKeys = [...castKeys(currentArc?.cast), ...castKeys(currentVolume?.cast)];
    const maxTokens = sizedSectionCeiling('catalog', budgetTokens - sumTokens(sections));
    const catalogText = await this.catalogService.render(projectId, { focusEntityKeys, documents: true, maxTokens });
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

  async forRevision(projectId: bigint, chapter: number, feedbackId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? DEFAULT_BUDGET;

    const [project, brief, prevChapter, currentVolume, recentChapters, prevDraft, currentDraft, feedbackRows] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter - 1)) }),
      this.db.query.volumes.findFirst({
        where: and(
          eq(schema.volumes.projectId, projectId),
          lte(schema.volumes.startChapter, chapter),
          or(sql`${schema.volumes.endChapter} >= ${chapter}`, isNull(schema.volumes.endChapter)),
        ),
        orderBy: schema.volumes.ordinal,
      }),
      this.db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), sql`${schema.chapters.number} < ${chapter}`, eq(schema.chapters.status, 'done')),
        orderBy: sql`${schema.chapters.number} DESC`,
        limit: 3,
      }),
      this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter - 1)) }),
      this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) }),
      this.db.query.userFeedback.findMany({
        where: and(eq(schema.userFeedback.projectId, projectId), sql`${schema.userFeedback.artifactRef} like ${'draft:' + chapter}`),
        orderBy: sql`${schema.userFeedback.createdAt} DESC`,
        limit: 5,
      }),
    ]);

    void feedbackId; // Used for audit context, not for filtering here.
    const sections: ContextSection[] = [];
    const forbidden = prevChapter || prevDraft || feedbackRows.length > 0 || recentChapters.length > 0 ? await loadWriterForbiddenFacts(this.db, projectId, chapter) : [];

    if (prevChapter) {
      const isIsolated = prevChapter.isolated;
      const isFinal = prevChapter.status === 'done';
      const tier: ContextTier = isFinal ? 'canonical' : 'working';
      if (isIsolated) {
        sections.push(makeSection('prev_ending', renderIsolatedEnding(prevChapter.summary, prevDraft?.state, forbidden), tier, [`chapter:${chapter - 1}`]));
      } else {
        sections.push(makeSectionTail('prev_ending', scrubForWriter(prevChapter.content ?? '', forbidden), PREV_ENDING_TAIL, tier, [`chapter:${chapter - 1}`]));
      }
    }

    const prevState = prevDraft?.state;
    if (prevState != null) sections.push(makeSection('continuation_state', renderCarriedState(prevState, forbidden), 'working', [`chapter:${chapter - 1}`]));

    if (brief) sections.push(makeSection('brief', brief.body, 'approved_intent', [`chapter:${chapter}`]));
    if (currentVolume) {
      const content = [currentVolume.objective, currentVolume.conflict].filter(Boolean).join('\n');
      sections.push(makeSection('volume_objective', content, 'approved_intent', [`volume:${currentVolume.volumeKey}`]));
    }

    const contextRefs = Array.isArray(brief?.contextRefs) ? (brief.contextRefs as string[]) : [];
    let unresolvedRefs: string[] = [];
    if (contextRefs.length > 0) {
      const { resolved, unresolved } = await this.resolveRefs(projectId, contextRefs, chapter);
      unresolvedRefs = unresolved;
      for (const s of resolved) sections.push(s);
    }

    if (currentDraft?.body) {
      sections.push(makeSection('current_draft', currentDraft.body, 'working', [`chapter:${chapter}`]));
    }

    if (feedbackRows.length > 0) {
      const notes = feedbackRows.map((f, i) => `${i + 1}. ${f.note ? scrubForWriter(f.note, forbidden) : f.disposition}`).join('\n');
      sections.push(makeSection('feedback', notes, 'working', []));
    }

    if (recentChapters.length > 0) {
      const lines = recentChapters
        .slice()
        .reverse()
        .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
      sections.push(makeSection('memory', scrubForWriter(lines.join('\n'), forbidden), 'canonical', []));
    }
    sections.push(makeSection('writing_style', project?.instructions?.trim() || DEFAULT_WRITING_INSTRUCTIONS, 'canonical', []));

    return this.finalize(projectId, 'revision', chapter, sections, unresolvedRefs, budgetTokens, opts);
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
      const lines = chapterRows.map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
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
   * Builds the pack for one chat turn: the stable segment is a whole-project index —
   * premise, inventories, one-line summaries — with the lookup tools pulling full artifacts on demand.
   * Volatile carries only the artifacts whose revision moved since the session started. History is NOT part of the pack — it rides as
   * prompt messages so provider caching can extend across turns.
   */
  async forChatTurn(projectId: bigint, session: ChatScopeInput, opts?: PackPolicyOptions): Promise<AssembledPack & { id: bigint | null }> {
    // An ideation session assembles through forIdeationTurn, which needs the seed row and the round the
    // router chose — neither of which a chat-scope input carries. ChatService rejects the scope before it
    // gets here; RefineService's /context/preview endpoint reaches this branch directly.
    if (session.scopeType === 'ideation') throw AppErrorCode.IDE_005.create();

    // Every other scope value, legacy rows included, is the hub.
    const [project, docs, volumes, arcs, catalogText] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
      this.db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId), orderBy: [schema.arcs.volumeKey, schema.arcs.ordinal] }),
      this.catalogService.render(projectId, { descriptors: 'compact' }),
    ]);

    const sections: ContextSection[] = [];
    if (project) sections.push(asStable(makeSection('premise', this.renderPremise(project), 'canonical', ['premise'])));
    if (docs.length > 0) sections.push(asStable(makeSection('doc_inventory', docs.map(d => `${d.section}/${d.slug}: ${firstLine(d.body)}`).join('\n'), 'canonical', [])));
    if (volumes.length > 0) sections.push(asStable(makeSection('volume_plan', volumes.map(v => this.renderVolumeLine(v)).join('\n'), 'approved_intent', [])));
    if (arcs.length > 0) {
      const lines = arcs.map(a => `${a.arcKey} [${a.volumeKey}] (chs ${a.chapterStart ?? '?'}–${a.chapterEnd ?? '?'}, ${a.status}): ${a.title ?? a.objective ?? ''}`);
      sections.push(asStable(makeSection('arc_inventory', lines.join('\n'), 'approved_intent', [])));
    }
    if (catalogText) sections.push(asStable(makeSection('catalog', catalogText, 'canonical', [])));
    sections.push(makeSection('pipeline_status', await this.renderPipelineStatus(projectId, project?.storyCurrentChapter ?? 0), 'working', []));

    // Volatile tail: artifacts whose revision moved since the session started — the model must know
    // the canon under discussion shifted beneath the conversation.
    const changed = await this.changedSince(projectId, session.createdAt);
    if (changed.length > 0) sections.push(makeSection('changed_since', changed.join('\n'), 'working', []));

    return this.finalize(projectId, 'chat_hub', null, sections, [], CHAT_HUB_BUDGET, opts);
  }

  /**
   * Pack for one Ideation Studio turn. Stable: the sheet, the locked
   * constraints, the taste anchors, and the playbooks for the shapes already committed to — all of it
   * byte-identical until the sheet itself moves. Volatile: the round the router just chose and the
   * concept rounds already offered. The conversation is NOT here — it travels as prompt messages
   * through the template's `history` placeholder, which carries its own cache breakpoint.
   */
  async forIdeationTurn(seed: IdeationSeedInput, router: RouterResult, opts?: IdeationPackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.ideationPack(seed, router, opts);
  }

  /** The concept round runs off the same seed pack, minus the interview: the cards answer no question. */
  async forIdeationConcepts(seed: IdeationSeedInput, opts?: Omit<IdeationPackOptions, 'commitIds'>): Promise<AssembledPack & { id: bigint | null }> {
    return this.ideationPack(seed, null, opts);
  }

  private async ideationPack(seed: IdeationSeedInput, router: RouterResult | null, opts?: IdeationPackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const state = toRouterSeedState(seed);
    const sections: ContextSection[] = [asStable(makeSection('seed_sheet', renderSeedSheet(state.fields), 'canonical', ['seed']))];

    if (state.constraints.length > 0) sections.push(asStable(makeSection('locked_constraints', renderSeedConstraints(state.constraints), 'canonical', ['seed'])));
    const anchors = renderTasteAnchors(state.tasteAnchors);
    if (anchors) sections.push(asStable(makeSection('taste_anchors', anchors, 'canonical', ['seed'])));
    const playbooks = renderPlaybookExcerpts(state.constraints);
    if (playbooks) sections.push(asStable(makeSection('shape_playbooks', playbooks, 'canonical', [])));

    // The round is what the turn is FOR: a sheet long enough to crowd it out would leave the model
    // wording nothing, so it is reserved against the budget instead of competing for what is left.
    if (router) sections.push({ ...makeSection('round_questions', renderRoundQuestions(router, opts?.commitIds ?? []), 'working', []), required: true });
    if (state.concepts.length > 0) sections.push(makeSection('concept_history', renderConceptHistory(state.concepts), 'working', ['seed']));

    return this.finalize(seed.projectId, 'ideation', null, sections, [], opts?.budgetTokens ?? IDEATION_BUDGET, opts);
  }

  /** The live production picture the hub reasons over: cursor, draft states, stale plans, open work. */
  private async renderPipelineStatus(projectId: bigint, storyCurrentChapter: number): Promise<string> {
    const [drafts, staleArcs, staleBriefs, pendingProposals, openJobs] = await Promise.all([
      this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: schema.drafts.chapter }),
      this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), isNotNull(schema.arcs.staleReason)) }),
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
    if (staleArcs.length > 0) lines.push(`Stale arcs: ${staleArcs.map(a => `${a.arcKey} (${a.staleReason})`).join(', ')}`);
    if (staleBriefs.length > 0) lines.push(`Stale briefs: chapters ${staleBriefs.map(b => b.chapter).join(', ')}`);
    if (pendingProposals > 0) lines.push(`Pending proposals awaiting review: ${pendingProposals}`);
    if (openJobs > 0) lines.push(`Jobs running or queued: ${openJobs}`);
    return lines.join('\n');
  }

  /** Pack for the arc-plan chain: the volume, its neighbours' handoffs, premise, skeleton, catalog. */
  async forArcPlanning(projectId: bigint, volumeKey: string, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? ARC_PLAN_BUDGET;

    const [project, volumes, openThreads, openMysteries, documents] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
      this.db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.status, 'open')) }),
      this.db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.status, 'open')) }),
      this.db.query.bibleDocuments.findMany({
        columns: { section: true, slug: true, frontmatter: true, body: true },
        where: and(eq(schema.bibleDocuments.projectId, projectId), inArray(schema.bibleDocuments.section, ['project', 'plot', 'world', 'power'])),
      }),
    ]);
    const volume = volumes.find(v => v.volumeKey === volumeKey);
    const prevVolume = volume ? volumes.filter(v => v.ordinal < volume.ordinal).at(-1) : undefined;
    const nextVolume = volume ? volumes.find(v => v.ordinal > volume.ordinal) : undefined;
    const prevLastArc = prevVolume
      ? await this.db.query.arcs
          .findMany({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, prevVolume.volumeKey)), orderBy: schema.arcs.ordinal })
          .then(arcs => arcs.at(-1))
      : undefined;

    const sections: ContextSection[] = [];
    if (volume) sections.push(asStable(makeSection('volume', this.renderVolumeFull(volume), 'approved_intent', [`volume:${volume.volumeKey}`])));
    if (project) sections.push(asStable(makeSection('premise', this.renderPremise(project), 'canonical', ['premise'])));
    if (prevLastArc?.hook) sections.push(asStable(makeSection('prev_hook', `${prevLastArc.arcKey}: ${prevLastArc.hook}`, 'approved_intent', [`arc:${prevLastArc.arcKey}`])));
    if (nextVolume?.objective) sections.push(asStable(makeSection('next_volume', nextVolume.objective, 'approved_intent', [`volume:${nextVolume.volumeKey}`])));
    if (project?.skeletonCharacterArcs || project?.skeletonPowerCurve) {
      const skeleton = [project.skeletonPowerCurve, project.skeletonCharacterArcs ? JSON.stringify(project.skeletonCharacterArcs) : ''].filter(Boolean).join('\n\n');
      sections.push(asStable(makeSection('skeleton', skeleton, 'canonical', [])));
    }

    const cachedBudget = budgetTokens - ARC_PLAN_UNCACHED_RESERVE;
    const catalogCeiling = sizedSectionCeiling('catalog', cachedBudget - sumTokens(sections) - ARC_PLAN_BIBLE_FLOOR);
    const catalogText = await this.catalogService.render(projectId, { focusEntityKeys: castKeys(volume?.cast), maxTokens: catalogCeiling });
    if (catalogText) sections.push(asStable(makeSection('catalog', catalogText, 'canonical', [])));

    const bibleSection = this.planningBibleSection(projectId, documents, cachedBudget - sumTokens(sections));
    if (bibleSection) sections.push(bibleSection);

    const dormantText = renderDormantThreads(computeDormantThreads(openThreads, openMysteries, project?.storyCurrentChapter ?? 0));
    if (dormantText) sections.push(makeSection('dormant_threads', dormantText, 'working', []));

    return this.finalize(projectId, 'arc_plan', null, sections, [], budgetTokens, opts);
  }

  // Sized to what the rest of the pack leaves, so the documents are cut rather than the whole section dropped by the budget.
  private planningBibleSection(projectId: bigint, documents: BibleDocRow[], available: number): ContextSection | null {
    const totalTokens = Math.min(ARC_PLAN_BIBLE_BUDGET, sizedSectionCeiling('bible_documents', available));
    if (totalTokens <= 0) return null;
    const digest = renderBibleDigest(documents, { totalTokens, perDocTokens: ARC_PLAN_BIBLE_DOC_TOKENS, coreOnly: true });
    if (!digest.text) return null;
    if (digest.omitted.length > 0) this.logger.info('arc planning pack left out bible documents', { projectId, omitted: digest.omitted, truncated: digest.truncated });
    const section = asStable(makeSection('bible_documents', digest.text, 'canonical', []));
    return { ...section, truncated: digest.truncated.length > 0 || digest.omitted.length > 0 };
  }

  /** Pack for premise enhancement; the bible audit reuses it with a fuller document inventory. */
  async forPremise(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'premise', 1, opts?.budgetTokens ?? PREMISE_BUDGET, opts);
  }

  async forAudit(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'audit', 5, opts?.budgetTokens ?? AUDIT_BUDGET, opts);
  }

  /**
   * Pack for the rebrand glossary seed: the project overview plus every known
   * proper noun the seeder must map — the extracted entity roster (with aliases) and world facts.
   * Both are empty on an unextracted project; the opening chapters travel as a template var instead.
   */
  async forRebrandSeed(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const [project, entities, facts] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), with: { aliases: true }, orderBy: [schema.entities.type, schema.entities.name] }),
      this.db.query.worldFacts.findMany({ where: eq(schema.worldFacts.projectId, projectId), orderBy: [schema.worldFacts.category, schema.worldFacts.key] }),
    ]);

    const sections: ContextSection[] = [];
    if (project) {
      const overview = [project.title ? `Title: ${project.title}` : '', this.renderPremise(project)].filter(Boolean).join('\n\n');
      if (overview) sections.push(asStable(makeSection('premise', overview, 'canonical', ['premise'])));
    }
    if (entities.length > 0) {
      const roster = entities.map(e => `${e.name} (${e.type})${e.aliases.length > 0 ? ` — aka ${e.aliases.map(a => a.alias).join(', ')}` : ''}`).join('\n');
      sections.push(asStable(makeSection('entity_roster', roster, 'canonical', [])));
    }
    if (facts.length > 0) {
      sections.push(asStable(makeSection('world_facts', facts.map(f => `${f.category}/${f.key}: ${f.value}`).join('\n'), 'canonical', [])));
    }

    return this.finalize(projectId, 'rebrand_seed', null, sections, [], opts?.budgetTokens ?? REBRAND_SEED_BUDGET, opts);
  }

  /**
   * Pack for one chapter conversion. World notes and directives are the stable
   * segment (byte-identical across chapters — the provider cache prefix); the glossary slice, carry
   * state, and previous converted ending are volatile. The chapter prose itself travels as a template
   * var so the pack stays cacheable. Callers pass pre-rendered strings — the assembler stays free of
   * rebrand-table knowledge.
   */
  async forRebrand(
    projectId: bigint,
    chapter: number,
    input: { worldNotes: string; directives: string | null; glossarySlice: string; carryState: string | null; prevBody: string | null },
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    if (input.directives) sections.push(asStable(makeSection('directives', input.directives, 'approved_intent', [])));
    sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));
    if (input.carryState) sections.push(makeSection('carry_state', input.carryState, 'working', []));
    if (input.prevBody) sections.push(makeSectionTail('prev_ending', input.prevBody, PREV_ENDING_TAIL, 'canonical', [`conversion:${chapter - 1}`]));

    return this.finalize(projectId, 'rebrand', chapter, sections, [], REBRAND_BUDGET, opts);
  }

  /**
   * Pack for the translation seed: the project overview plus every proper noun
   * already known — the extracted entity roster (with aliases) and world facts. Both are empty on a
   * freshly created translation project; the sample chapters travel as a template var instead.
   */
  async forTranslateSeed(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    const [project, entities, facts] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), with: { aliases: true }, orderBy: [schema.entities.type, schema.entities.name] }),
      this.db.query.worldFacts.findMany({ where: eq(schema.worldFacts.projectId, projectId), orderBy: [schema.worldFacts.category, schema.worldFacts.key] }),
    ]);

    const sections: ContextSection[] = [];
    if (project) {
      const overview = [project.title ? `Title: ${project.title}` : '', this.renderPremise(project)].filter(Boolean).join('\n\n');
      if (overview) sections.push(asStable(makeSection('premise', overview, 'canonical', ['premise'])));
    }
    if (entities.length > 0) {
      const roster = entities.map(e => `${e.name} (${e.type})${e.aliases.length > 0 ? ` — aka ${e.aliases.map(a => a.alias).join(', ')}` : ''}`).join('\n');
      sections.push(asStable(makeSection('entity_roster', roster, 'canonical', [])));
    }
    if (facts.length > 0) {
      sections.push(asStable(makeSection('world_facts', facts.map(f => `${f.category}/${f.key}: ${f.value}`).join('\n'), 'canonical', [])));
    }

    return this.finalize(projectId, 'translate_seed', null, sections, [], opts?.budgetTokens ?? TRANSLATE_SEED_BUDGET, opts);
  }

  /**
   * Pack for one chapter translation. The style notes and the term policy are
   * the stable segment — byte-identical for every chapter and every segment of a chapter, which is what
   * the provider cache prefix is worth here; the per-chapter glossary slice and the tail of the previous
   * CHAPTER's translation are volatile. The source segment and the previous SEGMENT's tail travel as
   * template vars, never in the pack, exactly as `forRebrand` does with the chapter prose. Callers pass
   * pre-rendered strings — the assembler stays free of translation-table knowledge.
   */
  async forTranslate(
    projectId: bigint,
    chapter: number,
    input: { styleNotes: string; termPolicy: string; glossarySlice: string; prevTranslatedTail: string | null },
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [
      asStable(makeSection('style_notes', input.styleNotes, 'canonical', [])),
      asStable(makeSection('term_policy', input.termPolicy, 'approved_intent', [])),
      makeSection('glossary_slice', input.glossarySlice, 'canonical', []),
    ];
    if (input.prevTranslatedTail) sections.push(makeSectionTail('prev_ending', input.prevTranslatedTail, PREV_ENDING_TAIL, 'canonical', [`translation:${chapter - 1}`]));

    return this.finalize(projectId, 'translate', chapter, sections, [], TRANSLATE_BUDGET, opts);
  }

  /**
   * Pack for one chapter reforge outline. Only the world notes are stable (the
   * cache prefix, byte-identical across chapters); the glossary slice is volatile. The source prose
   * itself travels as a template var, never in the pack, so the stable segment never churns.
   */
  async forReforgeOutline(
    projectId: bigint,
    chapter: number,
    input: { worldNotes: string; glossarySlice: string },
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));

    return this.finalize(projectId, 'reforge_outline', chapter, sections, [], REFORGE_OUTLINE_BUDGET, opts);
  }

  /**
   * Pack for one source-analysis call — a window pass or a synthesis pass.
   * Only the world notes are stable, so the cache prefix stays byte-identical across every window of a
   * run; the glossary slice, the window's signal digest, and the carry-forward state are volatile. The
   * window's source prose and the synthesis card index travel as template vars, never in the pack.
   * `window` is the 1-based window ordinal, or null for a synthesis pass.
   */
  async forReforgeAnalysis(
    projectId: bigint,
    window: number | null,
    input: { worldNotes: string; glossarySlice: string | null; signalDigest: string | null; carryState: string | null },
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    if (input.glossarySlice) sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));
    if (input.signalDigest) sections.push(makeSection('signal_digest', input.signalDigest, 'working', []));
    if (input.carryState) sections.push(makeSection('carry_state', input.carryState, 'working', []));

    return this.finalize(projectId, 'reforge_analysis', window, sections, [], REFORGE_ANALYSIS_BUDGET, opts);
  }

  /**
   * Pack for one chapter re-author. World notes, directives, the author's
   * instructions, and the target-length guide are the stable segment (the provider cache prefix); the glossary slice, carry state,
   * and previous REFORGED ending are volatile. `prev_ending` is the tail of the previous reforged
   * body — never the source tail, which would leak pre-rename names and break re-authored continuity.
   * The outline travels as a template var so the pack stays cacheable. Callers pass pre-rendered
   * strings — the assembler stays free of reforge-table knowledge.
   */
  async forReforge(
    projectId: bigint,
    chapter: number,
    input: {
      worldNotes: string;
      directives: string | null;
      instructions: string | null;
      /** Per-project word-count guide from `reforges.settings.targetWords`; omitted when unset. */
      targetWords?: number | null;
      glossarySlice: string;
      carryState: string | null;
      prevBody: string | null;
    },
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    if (input.directives) sections.push(asStable(makeSection('directives', input.directives, 'approved_intent', [])));
    if (input.instructions) sections.push(asStable(makeSection('instructions', input.instructions, 'approved_intent', [])));
    if (input.targetWords) {
      sections.push(asStable(makeSection('target_length', `Target about ${input.targetWords} words of prose; treat as a guide, not a hard wall.`, 'approved_intent', [])));
    }
    sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));
    if (input.carryState) sections.push(makeSection('carry_state', input.carryState, 'working', []));
    if (input.prevBody) sections.push(makeSectionTail('prev_ending', input.prevBody, PREV_ENDING_TAIL, 'canonical', [`reforge:${chapter - 1}`]));

    return this.finalize(projectId, 'reforge', chapter, sections, [], REFORGE_BUDGET, opts);
  }

  /**
   * Pack for one output chapter of a transform. The rename bible, the author's
   * voice instructions, and the SEEDED cut ledger are stable — the ledger seeded at approval is
   * byte-identical for the whole run, which is what keeps the cache prefix alive as the volatile
   * `discovered_cuts` section grows underneath it. The plan span (its kept beats, its continuity notes,
   * its bridge directive) is the per-chapter contract and is volatile, as are the glossary slice, the
   * carry state, and the tail of the previous OUTPUT chapter — never the source tail, which by
   * definition leaks pre-rename names and pre-cut material. Callers pass pre-rendered strings.
   */
  async forReforgeTransform(
    projectId: bigint,
    outputChapter: number,
    input: {
      worldNotes: string;
      directives: string | null;
      instructions: string | null;
      targetWords?: number | null;
      cutLedger: string;
      discoveredCuts: string | null;
      planSpan: string;
      bridge: string | null;
      glossarySlice: string;
      carryState: string | null;
      prevBody: string | null;
    },
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    if (input.directives) sections.push(asStable(makeSection('directives', input.directives, 'approved_intent', [])));
    if (input.instructions) sections.push(asStable(makeSection('instructions', input.instructions, 'approved_intent', [])));
    if (input.targetWords) {
      sections.push(asStable(makeSection('target_length', `Target about ${input.targetWords} words of prose; treat as a guide, not a hard wall.`, 'approved_intent', [])));
    }
    sections.push(asStable(makeSection('cut_ledger', input.cutLedger, 'approved_intent', [])));
    sections.push(makeSection('plan_span', input.planSpan, 'approved_intent', [`output:${outputChapter}`]));
    if (input.bridge) sections.push(makeSection('bridge', input.bridge, 'approved_intent', []));
    if (input.discoveredCuts) sections.push(makeSection('discovered_cuts', input.discoveredCuts, 'working', []));
    sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));
    if (input.carryState) sections.push(makeSection('carry_state', input.carryState, 'working', []));
    if (input.prevBody) sections.push(makeSectionTail('prev_ending', input.prevBody, PREV_ENDING_TAIL, 'canonical', [`output:${outputChapter - 1}`]));

    return this.finalize(projectId, 'reforge_transform', outputChapter, sections, [], REFORGE_TRANSFORM_BUDGET, opts);
  }

  /**
   * Pack for composing one image prompt. The art-style bible and the project premise are stable (they
   * bind every illustration in the project); the subject card and the canon that describes how the
   * subject looks are volatile. `subjectKey` is the entity key, the chapter number as text, or null
   * for the project cover.
   */
  async forIllustration(
    projectId: bigint,
    subjectType: schema.Illustration.SubjectType,
    subjectKey: string | null,
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const [project, artStyle] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.bibleDocuments.findFirst({
        where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, ART_STYLE_DOC.section), eq(schema.bibleDocuments.slug, ART_STYLE_DOC.slug)),
      }),
    ]);

    const sections: ContextSection[] = [];
    if (artStyle?.body) sections.push(asStable(makeSection('art_style', artStyle.body, 'canonical', [`doc:${ART_STYLE_DOC.section}/${ART_STYLE_DOC.slug}`])));
    if (project)
      sections.push(
        asStable(makeSection('premise', [project.title ? `Title: ${project.title}` : '', this.renderPremise(project)].filter(Boolean).join('\n\n'), 'canonical', ['premise'])),
      );

    if (subjectType === 'entity' && subjectKey) sections.push(...(await this.entitySubjectSections(projectId, subjectKey)));
    if (subjectType === 'chapter' && subjectKey) sections.push(...(await this.chapterSubjectSections(projectId, Number(subjectKey))));

    return this.finalize(projectId, 'illustration', subjectType === 'chapter' && subjectKey ? Number(subjectKey) : null, sections, [], ILLUSTRATION_BUDGET, opts);
  }

  private async entitySubjectSections(projectId: bigint, entityKey: string): Promise<ContextSection[]> {
    const entity = await this.db.query.entities.findFirst({
      where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)),
      with: { aliases: true },
    });
    if (!entity) return [];

    const card = [
      `${entity.name} (${entity.type}${entity.significance ? `, ${entity.significance}` : ''})`,
      entity.aliases.length > 0 ? `Also known as: ${entity.aliases.map(a => a.alias).join(', ')}` : '',
      entity.status ? `Status: ${entity.status}` : '',
      entity.appearance ? `Canonical appearance: ${entity.appearance}` : 'Canonical appearance: none recorded — derive one.',
      entity.body ?? '',
      entity.notes ?? '',
      entity.motivation ? `Motivation: ${entity.motivation}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const sections = [makeSection('subject_card', card, 'canonical', [`entity:${entityKey}`])];

    const facts = await this.db.query.worldFacts.findMany({
      where: eq(schema.worldFacts.projectId, projectId),
      orderBy: [schema.worldFacts.category, schema.worldFacts.key],
      limit: ILLUSTRATION_WORLD_FACTS_MAX,
    });
    if (facts.length > 0) sections.push(makeSection('world_facts', facts.map(f => `${f.category}/${f.key}: ${f.value}`).join('\n'), 'canonical', []));

    return sections;
  }

  private async chapterSubjectSections(projectId: bigint, chapter: number): Promise<ContextSection[]> {
    const [chapterRow, appearances] = await Promise.all([
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)) }),
      this.db.query.entityAppearances.findMany({ where: and(eq(schema.entityAppearances.projectId, projectId), eq(schema.entityAppearances.chapter, chapter)) }),
    ]);
    if (!chapterRow) return [];

    const sections = [
      makeSection('subject_card', [`Chapter ${chapter}: ${chapterRow.title ?? ''}`, chapterRow.summary ?? ''].filter(Boolean).join('\n\n'), 'canonical', [`chapter:${chapter}`]),
    ];

    const entityIds = appearances.map(a => a.entityId);
    if (entityIds.length === 0) return sections;

    const cast = await this.db.query.entities.findMany({ where: inArray(schema.entities.id, entityIds), orderBy: [schema.entities.name] });
    const rendered = cast.map(e => `${e.name} (${e.type}): ${e.appearance ?? 'no canonical appearance recorded'}`).join('\n');
    sections.push(
      makeSection(
        'cast_appearance',
        rendered,
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
    const [volumes, arcs, briefs, docs] = await Promise.all([
      this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), sql`${schema.volumes.updatedAt} > ${since}`) }),
      this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), sql`${schema.arcs.updatedAt} > ${since}`) }),
      this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), sql`${schema.briefs.updatedAt} > ${since}`) }),
      this.db.query.bibleDocuments.findMany({ where: and(eq(schema.bibleDocuments.projectId, projectId), sql`${schema.bibleDocuments.updatedAt} > ${since}`) }),
    ]);
    return [
      ...volumes.map(v => `volume:${v.volumeKey} is now at revision ${v.revision}`),
      ...arcs.map(a => `arc:${a.arcKey} is now at revision ${a.revision}`),
      ...briefs.map(b => `chapter:${b.chapter} brief is now at revision ${b.revision}`),
      ...docs.map(d => `doc:${d.section}/${d.slug} is now at revision ${d.revision}`),
    ];
  }

  private renderPremise(project: { premise: string | null; brief: string | null; themes: unknown; instructions: string | null }): string {
    const themes = Array.isArray(project.themes) ? (project.themes as string[]).join(', ') : '';
    return [project.premise ?? project.brief ?? '', themes ? `Themes: ${themes}` : '', project.instructions ? `Author instructions: ${project.instructions}` : '']
      .filter(Boolean)
      .join('\n\n');
  }

  private renderVolumeLine(v: schema.Plan.Volume): string {
    return `Vol ${v.ordinal} ${v.volumeKey} (${v.status}, chs ${v.startChapter ?? '?'}–${v.endChapter ?? '?'}, target ${v.targetChapterCount ?? '?'}): ${v.title ?? ''} — ${v.epitome ?? v.objective ?? ''}`;
  }

  private renderVolumeFull(v: schema.Plan.Volume): string {
    return [
      `**${v.title ?? v.volumeKey}** (${v.volumeKey}, ${v.status}, ordinal ${v.ordinal}, chs ${v.startChapter ?? '?'}–${v.endChapter ?? '?'}, target ${v.targetChapterCount ?? '?'})`,
      `Objective: ${v.objective ?? ''}`,
      `Conflict: ${v.conflict ?? ''}`,
      `Payoff: ${v.payoff ?? ''}`,
      Array.isArray(v.cast) && v.cast.length > 0 ? `Cast: ${(v.cast as string[]).join(', ')}` : '',
      v.body ?? '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async finalize(
    projectId: bigint,
    purpose: ContextPurpose,
    chapter: number | null,
    sections: ContextSection[],
    unresolvedRefs: string[],
    budgetTokens: number,
    opts?: { dryRun?: boolean; policy?: ForgeCallPolicy },
  ): Promise<AssembledPack & { id: bigint | null }> {
    const contributed = [...sections, ...pluginContextSections(opts?.policy, sections)];
    const { fitting: fittingSections, omitted } = applyBudget(contributed, budgetTokens);
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

    return { projectId, purpose, chapter, budgetTokens, usedTokens, sections: fittingSections, unresolvedRefs, omitted, renderedStable, renderedVolatile, rendered, id };
  }
}
