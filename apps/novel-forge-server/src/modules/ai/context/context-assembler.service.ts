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
  parseKnowledgeContract,
  renderChapterReveals,
  renderHiddenConstraints,
  renderKnownFacts,
  renderReaderKnows,
  withWriterNotes,
} from '../../bible/fact/knowledge-view';
import { loadWriterDisclosurePolicy, WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';
import { isReviewCurrent } from '../../finalize-review/finalize-review-gate';
import { bridgedSummary, type BridgeLoader, bridgeLoader, type BridgeSubject, type IsolationBridge, loadIsolationBridges } from '../../finalize-review/isolation-bridge';
import { loadActiveLedger } from '../../ledger/ledger-entries';
import { AUTHOR_BRIEF_TOPIC, ledgerSection, writerLinesSection } from '../../ledger/ledger-sections';
import { withoutLapsedRejections } from '../../refinement/idea-rejections';
import { writingInstructionAdditions } from '../prompts/writing-instructions';
import { type RetrievalHit, RetrievalService } from '../retrieval';
import { ORGANISED_TIMELINE_DOC } from './bible-docs';
import { type ChapterSpan } from './canon-guard';
import { type CatalogOptions, CatalogService } from './catalog.service';
import { ContextRefResolver, type ResolvedRefs, type WriterRefs } from './context-ref-resolver';
import { IllustrationPackBuilder, type IllustrationPackOptions } from './illustration-pack.builder';
import {
  nextChapterNumber,
  NOVEL_CHAT_MESSAGE_ALLOWANCE,
  NOVEL_CHAT_PACK_FLOOR,
  NOVEL_CHAT_PACK_MARGIN,
  NOVEL_CHAT_REQUEST_BUDGET,
  NOVEL_CHAT_SECTION_CAPS,
  renderAwaitingAuthor,
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
import { organisedTimelineText } from './organised-timeline';
import { finalizePack } from './pack-finalize';
import { type PackOptions, type PackPolicyOptions } from './pack-options';
import {
  allowedCluesSection,
  asStable,
  entityCardTier,
  entityLabel,
  fitFacts,
  fitToCap,
  latestRelationships,
  makeRefSection,
  makeSection,
  previousEnding,
  RECENT_SUMMARY_COUNT,
  recentSummaries,
  recentSummaryLine,
  renderCharacterState,
  renderEntityCard,
  sectionSubject,
  sizedSectionCeiling,
  subjectsFirst,
  sumTokens,
  walledOff,
  writingStyleSection,
} from './pack-render';
import { pluginContextSections } from './plugin-sections';
import { PremisePackBuilder } from './premise-pack.builder';
import { type AssembledPack, type ContextSection, type ContextTier, type OmittedSection } from './sections';
import { applyBudget, countTokens, truncateAtParagraph } from './token-budget';
import { loadWriterBrief } from './writer-brief';
import { assertWriterContextFits, renderCompletedVolumes, WRITER_OPTIONAL_PRIORITY, WRITER_SECTION_CAPS, type WriterReservation } from './writer-context';

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

export const FULL_CAST_MAX = 5;

const RECENT_SUMMARY_MAX = 400;

// History is prompt messages, not pack text; its budgets are enforced by ChatService compaction.
export const CHAT_HISTORY_BUDGET = 6_000;
export const CHAT_SUMMARY_BUDGET = 1_500;
export const NOVEL_CHAT_HISTORY_ALLOWANCE = CHAT_HISTORY_BUDGET + CHAT_SUMMARY_BUDGET + NOVEL_CHAT_MESSAGE_ALLOWANCE;
// A planning pack carries the whole catalog — every canon fact and a description per entity.
export const OUTLINE_BUDGET = 32_000;
// Room for an organise run's full timeline; a page edited past it loses its last lines rather than crowding out the catalog.
export const OUTLINE_TIMELINE_CAP = 2_500;
export const LATER_PLANS_LEAD = [
  'Planner-only: the chapter writer and readers never see this, and you never quote or cite it. It is where the author means the story to go.',
  'Let what is placed later shape this chapter: set it up, seed it, foreshadow it and put people and things where it will need them.',
  'Never state, reveal or play out a later event before its place.',
].join(' ');

// Room for the card's own heading, name, alias and status lines inside the POV card's limit.
const POV_CARD_BODY_MAX = WRITER_SECTION_CAPS.povCard - 200;
// The "earlier volumes not shown" line the completed-volume summary may add after it is sized.
const COMPLETED_VOLUMES_NOTE_MARGIN = 20;

@Injectable()
export class ContextAssembler {
  private readonly logger = Logger.getLogger(APP_NAME, ContextAssembler.name);
  private readonly db: PrimaryDatabase;
  private readonly refResolver: ContextRefResolver;
  private readonly illustrationPacks: IllustrationPackBuilder;
  private readonly premisePacks: PremisePackBuilder;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly catalogService: CatalogService,
    private readonly retrievalService?: RetrievalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
    this.refResolver = new ContextRefResolver(this.db);
    this.illustrationPacks = new IllustrationPackBuilder(this.db);
    this.premisePacks = new PremisePackBuilder(this.db);
  }

  /** The active ledger, for a planner that reads the Story Bible outside a pack. */
  activeLedger(projectId: bigint): Promise<Ledger.Entry[]> {
    return loadActiveLedger(this.db, projectId);
  }

  catalog(projectId: bigint, options?: CatalogOptions): Promise<string> {
    return this.catalogService.render(projectId, options);
  }

  /** `chapter` is the chapter the refs are resolved for; it makes the sections writer-safe for it. */
  resolveRefs(projectId: bigint, refs: string[], chapter?: number): Promise<ResolvedRefs> {
    return this.refResolver.resolveRefs(projectId, refs, chapter);
  }

  /** Which refs the writer of `chapter` would read under `disclosure`, by ref alone: a preview never carries their content. */
  writerRefs(projectId: bigint, refs: string[], chapter: number, disclosure: WriterDisclosurePolicy, overlay?: PlanOverlay): Promise<WriterRefs> {
    return this.refResolver.writerRefs(projectId, refs, chapter, disclosure, overlay);
  }

  sanitizeOutlinedRefs(projectId: bigint, refs: string[]): Promise<{ kept: string[]; dropped: string[] }> {
    return this.refResolver.sanitizeOutlinedRefs(projectId, refs);
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
    const derivedCuts: OmittedSection[] = [...(openCanon?.omitted ?? [])];

    const planTokens = countTokens(writerBrief.chapterBrief) + countTokens(writerBrief.endingContract);
    const reservations: WriterReservation[] = [{ name: 'the chapter plan', tokens: planTokens, cap: WRITER_SECTION_CAPS.chapterPlan, fromPlan: true }];
    const sections: ContextSection[] = [];
    const reserve = (section: ContextSection, name: string, cap: number, fromPlan = false): void => {
      sections.push({ ...section, required: true });
      reservations.push({ name, tokens: section.tokens, cap, fromPlan });
    };
    const reserveDerived = (section: ContextSection, name: string, cap: number, fromPlan = false): void => reserve(fitToCap(section, cap), name, cap, fromPlan);
    const prevIsolated = Boolean(prevChapter?.isolated || prevDraft?.isolated);
    const rawIsolated = opts?.policy?.writerClass === 'permissive';
    const bridgeSubjects: BridgeSubject[] = [
      ...recentChapters.map(row => ({ chapter: row.number, isolated: row.isolated })),
      ...recentDrafts,
      { chapter: chapter - 1, isolated: prevIsolated },
    ];
    const bridges = rawIsolated ? new Map<number, IsolationBridge>() : await loadBridges(bridgeSubjects);
    const previous = previousEnding({ chapter: chapter - 1, row: prevChapter, draft: prevDraft, bridge: bridges.get(chapter - 1), rawIsolated, disclosure });
    if (previous.ending) reserveDerived(previous.ending, "the previous chapter's ending", WRITER_SECTION_CAPS.prevEnding);
    if (previous.state) reserveDerived(previous.state, 'the continuation state', WRITER_SECTION_CAPS.continuationState);

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
      const { resolved, unresolved, withheld, characters } = await this.refResolver.resolveRefsFor(projectId, refs, chapter, disclosure, undefined, loadBridges);
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
    const pack = await finalizePack(this.db, projectId, 'generation', chapter, [...sections, ...plugins], unresolvedRefs, Math.max(0, budgetTokens - planTokens), {
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

    const previous = chapter - 1;
    const [currentVolume, recentChapters, prevChapter, prevDraft, ledger, timelineDocs] = await Promise.all([
      (opts?.volumeKey !== undefined ? Promise.resolve(opts.volumeKey) : nearestVolumeKey(this.db, projectId, opts?.insertAfter ?? chapter)).then(volumeKey =>
        this.volumeByKey(projectId, volumeKey),
      ),
      this.db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), sql`${schema.chapters.number} < ${chapter}`, eq(schema.chapters.status, 'done')),
        orderBy: sql`${schema.chapters.number} DESC`,
        limit: 3,
      }),
      this.db.query.chapters.findFirst({
        columns: { status: true, isolated: true, content: true, summary: true },
        where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, previous)),
      }),
      this.db.query.drafts.findFirst({
        columns: { body: true, summary: true, state: true, isolated: true, staleReason: true },
        where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, previous)),
      }),
      loadActiveLedger(this.db, projectId),
      this.db.query.bibleDocuments.findMany({
        columns: { section: true, slug: true, body: true },
        where: and(
          eq(schema.bibleDocuments.projectId, projectId),
          eq(schema.bibleDocuments.section, ORGANISED_TIMELINE_DOC.section),
          eq(schema.bibleDocuments.slug, ORGANISED_TIMELINE_DOC.slug),
        ),
      }),
    ]);

    const sections: ContextSection[] = [];

    if (currentVolume?.objective) {
      sections.push({ ...makeSection('volume_objective', currentVolume.objective, 'approved_intent', [`volume:${currentVolume.volumeKey}`]), required: true });
    }

    const outlineBridges = await loadIsolationBridges(this.db, projectId, [
      ...recentChapters.map(row => ({ chapter: row.number, isolated: row.isolated })),
      { chapter: previous, isolated: Boolean(prevChapter?.isolated || prevDraft?.isolated) },
    ]);
    const recentLines = recentChapters
      .slice()
      .reverse()
      .map(row => walledOff(row, outlineBridges.get(row.number)))
      .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
    if (recentLines.length > 0) {
      sections.push({ ...makeSection('memory', recentLines.join('\n'), 'canonical', []), required: true });
    }

    const ending = previousEnding({
      chapter: previous,
      row: prevChapter,
      draft: prevDraft,
      bridge: outlineBridges.get(previous),
      rawIsolated: opts?.policy?.writerClass === 'permissive',
      disclosure: WriterDisclosurePolicy.planner(),
    });
    for (const found of [ending.ending, ending.state]) if (found) sections.push({ ...found, required: true });
    sections.push(ledgerSection(await withoutLapsedRejections(this.db, projectId, ledger), 'volatile'));
    const timeline = organisedTimelineText(timelineDocs, ledger);
    if (timeline) sections.push({ ...fitToCap(makeSection('later_plans', `${LATER_PLANS_LEAD}\n\n${timeline}`, 'approved_intent'), OUTLINE_TIMELINE_CAP), required: true });

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

    return finalizePack(this.db, projectId, 'outline', chapter, sections, [], budgetTokens, opts);
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

    return finalizePack(this.db, projectId, 'validation', null, sections, [], budgetTokens, opts);
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
    const latest = next - 1;
    const [handoffBriefs, pipelineStatus, changed, latestChapter, latestDraft] = await Promise.all([
      this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), inArray(schema.briefs.chapter, [latest, next])) }),
      this.renderPipelineStatus(projectId, project?.storyCurrentChapter ?? 0),
      this.changedSince(projectId, sessionStartedAt),
      latest > 0
        ? this.db.query.chapters.findFirst({
            columns: { status: true, isolated: true, content: true, summary: true },
            where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, latest)),
          })
        : undefined,
      latest > 0
        ? this.db.query.drafts.findFirst({
            columns: { body: true, summary: true, state: true, isolated: true, staleReason: true },
            where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, latest)),
          })
        : undefined,
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
    const latestEnding = previousEnding({
      chapter: latest,
      row: latestChapter,
      draft: latestDraft,
      bridge: chatBridges.get(latest),
      rawIsolated: false,
      disclosure: WriterDisclosurePolicy.planner(),
      caps: { ending: caps.latestEnding, state: caps.latestState },
    });
    if (latestEnding.ending) volatile.push({ ...latestEnding.ending, priority: 0 });
    if (latestEnding.state) volatile.push({ ...latestEnding.state, priority: 1 });
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
    return finalizePack(this.db, projectId, 'chat_hub', null, [...pinned, ...volatile, ...plugins], [], Math.max(sumTokens(kept.fitting), packRoom), {
      ...opts,
      omitted: kept.omitted,
    });
  }

  /** The live production picture the hub reasons over: cursor, draft states, stale plans, open work, and the Story Bible work waiting on the author. */
  private async renderPipelineStatus(projectId: bigint, storyCurrentChapter: number): Promise<string> {
    const [drafts, staleBriefs, pendingProposals, openJobs, continuity, reviews] = await Promise.all([
      this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: schema.drafts.chapter }),
      this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), isNotNull(schema.briefs.staleReason)) }),
      this.db.$count(schema.refinementProposals, and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.status, 'pending'))),
      this.db.$count(schema.jobs, and(eq(schema.jobs.projectId, projectId), inArray(schema.jobs.status, ['pending', 'in_progress']))),
      this.db.query.continuityProposals.findMany({
        columns: { chapter: true },
        where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.status, 'pending')),
      }),
      this.db.query.finalizeReviews.findMany({
        columns: { chapter: true, draftRevision: true, sourceHash: true },
        where: and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.status, 'ready'), eq(schema.finalizeReviews.bridgeOnly, false)),
        with: { items: { columns: { decision: true } } },
      }),
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
    const draftOf = new Map(drafts.map(draft => [draft.chapter, draft]));
    const current = reviews.filter(review => {
      const draft = draftOf.get(review.chapter);
      return draft !== undefined && draft.status !== 'final' && isReviewCurrent(review, draft);
    });
    const openOf = (review: (typeof current)[number]): number => review.items.filter(item => item.decision === null).length;
    const awaiting = renderAwaitingAuthor({
      continuity: continuity.map(proposal => proposal.chapter),
      asking: current.filter(review => openOf(review) > 0).map(review => ({ chapter: review.chapter, open: openOf(review) })),
      answered: current.filter(review => openOf(review) === 0).map(review => review.chapter),
    });
    if (awaiting) lines.push(awaiting);
    return lines.join('\n');
  }

  forPremise(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePacks.forPremise(projectId, opts);
  }

  forAudit(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePacks.forAudit(projectId, opts);
  }

  forIllustration(
    projectId: bigint,
    subjectType: schema.Illustration.SubjectType,
    subjectKey: string | null,
    opts?: IllustrationPackOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    return this.illustrationPacks.forIllustration(projectId, subjectType, subjectKey, opts);
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

  private async volumeByKey(projectId: bigint, volumeKey: string | null | undefined): Promise<schema.Plan.Volume | undefined> {
    if (!volumeKey) return undefined;
    return this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)) });
  }
}
