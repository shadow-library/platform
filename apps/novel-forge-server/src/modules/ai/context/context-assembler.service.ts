import { createHash } from 'node:crypto';

import { and, between, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { loadKnowledgeView, parseKnowledgeContract, renderChapterReveals, renderHiddenConstraints, renderKnownFacts } from '../../bible/fact/knowledge-view';
import { DEFAULT_WRITING_INSTRUCTIONS } from '../prompts/authoring-preamble';
import { type RetrievalHit, RetrievalService } from '../retrieval';
import { CatalogService } from './catalog.service';
import { computeDormantThreads, renderDormantThreads } from './dormant-threads';
import { type AssembledPack, type ContextPurpose, type ContextSection, type ContextSegment, type ContextTier, joinSections, renderSection, splitSegments } from './sections';
import { applyBudget, countTokens, truncateAtParagraph, truncateAtParagraphTail } from './token-budget';

export interface ChatScopeInput {
  scopeType: schema.Refinement.ChatScope;
  scopeRef: string | null;
  createdAt: Date;
}

export const DEFAULT_BUDGET = 24_000;
export const PREV_ENDING_TAIL = 500;
export const FULL_CAST_MAX = 5;

// Refinement budgets (design §10.4). History is prompt messages, not pack text, so the chat pack
// budget is stable + volatile-delta; the history budgets are enforced by ChatService compaction.
export const CHAT_STABLE_BUDGET = 14_000;
export const CHAT_VOLATILE_DELTA_BUDGET = 2_000;
export const CHAT_PACK_BUDGET = CHAT_STABLE_BUDGET + CHAT_VOLATILE_DELTA_BUDGET;
// The hub sees the whole project (catalog + full plan + pipeline status), so it gets catalog headroom
// over the scoped chat budget (chat-hub design §6.1).
export const CHAT_HUB_BUDGET = 20_000;
// A bootstrap hub turn IS the authoring session: the interview answers and the premise/bible/cast it
// produces must all stay verbatim, because every later step is derived from them.
export const CHAT_BOOTSTRAP_BUDGET = 32_000;
export const CHAT_HISTORY_BUDGET = 6_000;
export const CHAT_BOOTSTRAP_HISTORY_BUDGET = 10_000;
export const CHAT_SUMMARY_BUDGET = 1_500;
export const ARC_PLAN_BUDGET = 16_000;
export const PREMISE_BUDGET = 8_000;
export const AUDIT_BUDGET = 12_000;
export const REBRAND_SEED_BUDGET = 10_000;
export const REBRAND_BUDGET = 12_000;
// Reforge mirrors the rebrand chapter budget: the source prose (outline pack) and the outline (write
// pack) both travel as template vars, not pack sections, so the pack itself stays rebrand-sized.
export const REFORGE_OUTLINE_BUDGET = 12_000;
export const REFORGE_BUDGET = 12_000;
// The analysis window's chapters and the synthesis card index both travel as template vars, so the pack
// only carries the rename bible, the window's signal digest, and the carry-forward state (§3.2).
export const REFORGE_ANALYSIS_BUDGET = 12_000;
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

function asStable(section: ContextSection): ContextSection {
  return { ...section, segment: 'stable' };
}

function firstLine(text: string | null): string {
  return (text ?? '').split('\n', 1)[0] ?? '';
}

@Injectable()
export class ContextAssembler {
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly catalogService: CatalogService,
    private readonly retrievalService?: RetrievalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  catalog(projectId: bigint): Promise<string> {
    return this.catalogService.render(projectId);
  }

  async resolveRefs(projectId: bigint, refs: string[]): Promise<{ resolved: ContextSection[]; unresolved: string[] }> {
    const entityKeys: string[] = [];
    const worldFactCategories: string[] = [];
    const threadKeys: string[] = [];
    const mysteryKeys: string[] = [];
    const chapterNumbers: number[] = [];
    const volumeKeys: string[] = [];
    const bibleDocRefs: { section: string; slug: string }[] = [];
    const factKeys: string[] = [];
    const unknownRefs: string[] = [];

    for (const ref of refs) {
      const colon = ref.indexOf(':');
      if (colon === -1) {
        unknownRefs.push(ref);
        continue;
      }
      const prefix = ref.slice(0, colon);
      const value = ref.slice(colon + 1);
      switch (prefix) {
        case 'entity':
          entityKeys.push(value);
          break;
        case 'world_fact':
          worldFactCategories.push(value);
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
        default:
          unknownRefs.push(ref);
      }
    }

    const [entitiesRows, worldFactRows, threadRows, mysteryRows, chapterRows, volumeRows, bibleDocRows, factRows] = await Promise.all([
      entityKeys.length > 0
        ? this.db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)), with: { aliases: true } })
        : [],
      worldFactCategories.length > 0
        ? this.db.query.worldFacts.findMany({ where: and(eq(schema.worldFacts.projectId, projectId), inArray(schema.worldFacts.category, worldFactCategories)) })
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
    const worldFactMap = new Map<string, (typeof worldFactRows)[number][]>();
    for (const f of worldFactRows) {
      if (!worldFactMap.has(f.category)) worldFactMap.set(f.category, []);
      const catFacts = worldFactMap.get(f.category);
      if (catFacts) catFacts.push(f);
    }
    const threadMap = new Map(threadRows.map(t => [t.threadKey, t]));
    const mysteryMap = new Map(mysteryRows.map(m => [m.mysteryKey, m]));
    const chapterMap = new Map(chapterRows.map(c => [c.number, c]));
    const volumeMap = new Map(volumeRows.map(v => [v.volumeKey, v]));
    const bibleDocMap = new Map(bibleDocRows.map(d => [`${d.section}/${d.slug}`, d]));
    const factMap = new Map(factRows.map(f => [f.factKey, f]));

    const resolved: ContextSection[] = [];
    const unresolved: string[] = [];

    for (const ref of refs) {
      const colon = ref.indexOf(':');
      if (colon === -1) {
        unresolved.push(ref);
        continue;
      }
      const prefix = ref.slice(0, colon);
      const value = ref.slice(colon + 1);

      switch (prefix) {
        case 'entity': {
          const entity = entityMap.get(value);
          if (!entity) {
            unresolved.push(ref);
            break;
          }
          const aliasLine = entity.aliases.length > 0 ? `\nAliases: ${entity.aliases.map(a => a.alias).join(', ')}` : '';
          const statusLine = entity.status != null ? `\nStatus: ${entity.status}` : '';
          const bodyRaw = entity.body ?? entity.notes ?? '';
          const { text: body } = truncateAtParagraph(bodyRaw, 350);
          const cardContent = `**${entity.name}** (${entity.type}, ${entity.status ?? 'active'})\n${body}${aliasLine}${statusLine}`;
          const tier: ContextTier = entity.status == null || entity.status === 'active' ? 'canonical' : entity.status === 'planned' ? 'approved_intent' : 'canonical';
          resolved.push(makeSection(`ref:entity:${value}`, cardContent, tier, [ref]));
          break;
        }
        case 'world_fact': {
          const facts = worldFactMap.get(value);
          if (!facts || facts.length === 0) {
            unresolved.push(ref);
            break;
          }
          const lines = facts.map(f => {
            const { text } = truncateAtParagraph(f.value, 150);
            return `${f.key}: ${text}`;
          });
          resolved.push(makeSection(`ref:world_fact:${value}`, lines.join('\n'), 'canonical', [ref]));
          break;
        }
        case 'thread': {
          const thread = threadMap.get(value);
          if (!thread) {
            unresolved.push(ref);
            break;
          }
          const content = `**${thread.threadKey}** (${thread.status}, ch ${thread.openedChapter ?? '?'}–${thread.closedChapter ?? '?'})\n${thread.summary ?? ''}`;
          resolved.push(makeSection(`ref:thread:${value}`, content, 'canonical', [ref]));
          break;
        }
        case 'mystery': {
          const mystery = mysteryMap.get(value);
          if (!mystery) {
            unresolved.push(ref);
            break;
          }
          const content = `**${mystery.mysteryKey}** (${mystery.status}, ch ${mystery.openedChapter ?? '?'})\n${mystery.question}`;
          resolved.push(makeSection(`ref:mystery:${value}`, content, 'canonical', [ref]));
          break;
        }
        case 'chapter': {
          const n = parseInt(value, 10);
          const chapter = chapterMap.get(n);
          if (!chapter) {
            unresolved.push(ref);
            break;
          }
          const isDraft = chapter.status !== 'done';
          const prefix2 = isDraft ? '[DRAFT — not yet canon] ' : '';
          const content = `${prefix2}Ch ${n}: ${chapter.summary ?? ''}`;
          const tier: ContextTier = isDraft ? 'working' : 'canonical';
          resolved.push(makeSection(`ref:chapter:${value}`, content, tier, [ref]));
          break;
        }
        case 'volume': {
          const volume = volumeMap.get(value);
          if (!volume) {
            unresolved.push(ref);
            break;
          }
          const tier: ContextTier = volume.status === 'source' ? 'canonical' : 'approved_intent';
          const content = `**${volume.title ?? volume.volumeKey}** (${volume.status})\nObjective: ${volume.objective ?? ''}\nChs ${volume.startChapter ?? '?'}–${volume.endChapter ?? '?'}`;
          resolved.push(makeSection(`ref:volume:${value}`, content, tier, [ref]));
          break;
        }
        case 'bible_doc': {
          const slashIdx = value.indexOf('/');
          const section = slashIdx === -1 ? value : value.slice(0, slashIdx);
          const slug = slashIdx === -1 ? '' : value.slice(slashIdx + 1);
          const doc = bibleDocMap.get(`${section}/${slug}`);
          if (!doc || !doc.body) {
            unresolved.push(ref);
            break;
          }
          const { text: body } = truncateAtParagraph(doc.body, 8_000);
          resolved.push(makeSection(`ref:bible_doc:${value}`, `**${doc.section}/${doc.slug}**\n\n${body}`, 'canonical', [ref]));
          break;
        }
        case 'fact': {
          // Deliberately NOT surfaced via catalog.service.ts: canon_facts carries hidden-truth rows
          // (character-knowledge design) that must stay POV-filtered until ledgered. Only hand-authored
          // refs — plan-import, manual brief edits, hand-authored chat-hub lookups — may name a fact:
          // ref, since the automated outliner reading the catalog must never be able to request one and
          // self-spoil a not-yet-revealed fact into a future chapter's context.
          const fact = factMap.get(value);
          if (!fact) {
            unresolved.push(ref);
            break;
          }
          const constraintLine = fact.constraintNote ? `\nConstraint: ${fact.constraintNote}` : '';
          resolved.push(makeSection(`ref:fact:${value}`, `**${fact.factKey}**: ${fact.text}${constraintLine}`, 'canonical', [ref]));
          break;
        }
        default:
          unresolved.push(ref);
      }
    }

    return { resolved, unresolved };
  }

  async forChapter(projectId: bigint, chapter: number, opts?: { budgetTokens?: number; dryRun?: boolean }): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? DEFAULT_BUDGET;

    const [project, brief, prevChapter, currentVolume, recentChapters, prevDraft] = await Promise.all([
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
    ]);

    const currentArc = brief?.arcKey ? await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, brief.arcKey)) }) : undefined;

    const sections: ContextSection[] = [];

    if (prevChapter) {
      const isGrok = prevChapter.generator === 'grok';
      const isFinal = prevChapter.status === 'done';
      const tier: ContextTier = isFinal ? 'canonical' : 'working';
      if (isGrok) {
        const stateStr = prevDraft?.state ? JSON.stringify(prevDraft.state) : 'null';
        const content = `Summary: ${prevChapter.summary ?? ''}\nState: ${stateStr}`;
        sections.push(makeSection('prev_ending', content, tier, [`chapter:${chapter - 1}`]));
      } else {
        const raw = prevChapter.content ?? '';
        sections.push(makeSectionTail('prev_ending', raw, PREV_ENDING_TAIL, tier, [`chapter:${chapter - 1}`]));
      }
    } else if (prevDraft?.body) {
      // Chapter N-1 hasn't been finalized yet (mid-batch): the `chapters` row doesn't exist, so fall back
      // to the just-drafted prose tail instead of leaving chapter N with only continuation-state fields.
      const { text, truncated } = truncateAtParagraphTail(prevDraft.body, PREV_ENDING_TAIL);
      const content = `[DRAFT — not yet canon]\n${text}`;
      const rendered = renderSection('prev_ending', content);
      sections.push({ key: 'prev_ending', tier: 'working', segment: 'volatile', tokens: countTokens(rendered), truncated, sourceRefs: [`chapter:${chapter - 1}`], rendered });
    }

    const prevState = prevDraft?.state;
    if (prevState != null) {
      const content = typeof prevState === 'string' ? prevState : JSON.stringify(prevState);
      sections.push(makeSection('continuation_state', content, 'working', [`chapter:${chapter - 1}`]));
    }

    if (currentVolume) {
      const content = [currentVolume.objective, currentVolume.conflict].filter(Boolean).join('\n');
      sections.push(asStable(makeSection('volume_objective', content, 'approved_intent', [`volume:${currentVolume.volumeKey}`])));
    }

    if (currentArc) {
      const content = [currentArc.objective, currentArc.escalation, currentArc.hook].filter(Boolean).join('\n');
      if (content) sections.push(asStable(makeSection('arc_objective', content, 'approved_intent', [`arc:${currentArc.arcKey}`])));
    }

    // Only the POV cast's ledgered facts enter the drafting pack; still-hidden facts surface as behavioral
    // constraints, never as text. Absent a contract the feature is off and nothing changes.
    const knowledgeContract = parseKnowledgeContract(brief?.knowledgeContract);
    if (knowledgeContract) {
      const view = await loadKnowledgeView(this.db, projectId, chapter, knowledgeContract);
      if (view.known.length > 0) {
        sections.push(
          makeSection(
            'known_facts',
            renderKnownFacts(view.known),
            'canonical',
            view.known.map(f => `fact:${f.factKey}`),
          ),
        );
      }
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
            view.hidden.filter(f => f.constraintNote).map(f => `fact:${f.factKey}`),
          ),
        );
      }
    }

    const contextRefs = Array.isArray(brief?.contextRefs) ? (brief.contextRefs as string[]) : [];
    let unresolvedRefs: string[] = [];
    let refSections: ContextSection[] = [];

    if (contextRefs.length > 0) {
      const { resolved, unresolved } = await this.resolveRefs(projectId, contextRefs);
      unresolvedRefs = unresolved;
      refSections = resolved;
    }

    // Only the first FULL_CAST_MAX entity refs retain caller-requested priority; the rest move below memory and style.
    const entityRefSections = refSections.filter(s => s.key.startsWith('ref:entity:'));
    const nonEntityRefSections = refSections.filter(s => !s.key.startsWith('ref:entity:'));
    const priorityEntitySections = entityRefSections.slice(0, FULL_CAST_MAX).map(asStable);
    const excessEntitySections = entityRefSections.slice(FULL_CAST_MAX).map(asStable);

    for (const s of [...priorityEntitySections, ...nonEntityRefSections.map(asStable)]) sections.push(s);

    if (recentChapters.length > 0) {
      const lines = recentChapters
        .slice()
        .reverse()
        .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
      sections.push(makeSection('memory', lines.join('\n'), 'canonical', []));
    }

    // Writing style is always present because this is the generator's only source for voice, craft, and length.
    sections.push(asStable(makeSection('writing_style', project?.instructions?.trim() || DEFAULT_WRITING_INSTRUCTIONS, 'canonical', [])));

    for (const s of excessEntitySections) sections.push(s);

    return this.finalize(projectId, 'generation', chapter, sections, unresolvedRefs, budgetTokens, opts?.dryRun);
  }

  async forOutline(projectId: bigint, chapter: number, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? DEFAULT_BUDGET;

    const [currentVolume, recentChapters, prevVolumes] = await Promise.all([
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
    ]);

    const sections: ContextSection[] = [];

    if (currentVolume) {
      const parts = [currentVolume.objective, currentVolume.conflict, currentVolume.payoff].filter(Boolean);
      sections.push(makeSection('volume_objective', parts.join('\n'), 'approved_intent', [`volume:${currentVolume.volumeKey}`]));
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
      sections.push(makeSection('memory', memoryParts.join('\n'), 'canonical', []));
    }

    const catalogText = await this.catalogService.render(projectId);
    if (catalogText) {
      sections.push(makeSection('catalog', catalogText, 'canonical', []));
    }

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

    return this.finalize(projectId, 'outline', chapter, sections, [], budgetTokens, false);
  }

  async forRevision(projectId: bigint, chapter: number, feedbackId: bigint, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
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

    if (prevChapter) {
      const isGrok = prevChapter.generator === 'grok';
      const isFinal = prevChapter.status === 'done';
      const tier: ContextTier = isFinal ? 'canonical' : 'working';
      if (isGrok) {
        const stateStr = prevDraft?.state ? JSON.stringify(prevDraft.state) : 'null';
        sections.push(makeSection('prev_ending', `Summary: ${prevChapter.summary ?? ''}\nState: ${stateStr}`, tier, [`chapter:${chapter - 1}`]));
      } else {
        sections.push(makeSectionTail('prev_ending', prevChapter.content ?? '', PREV_ENDING_TAIL, tier, [`chapter:${chapter - 1}`]));
      }
    }

    const prevState = prevDraft?.state;
    if (prevState != null) {
      const content = typeof prevState === 'string' ? prevState : JSON.stringify(prevState);
      sections.push(makeSection('continuation_state', content, 'working', [`chapter:${chapter - 1}`]));
    }

    if (brief) sections.push(makeSection('brief', brief.body, 'approved_intent', [`chapter:${chapter}`]));
    if (currentVolume) {
      const content = [currentVolume.objective, currentVolume.conflict].filter(Boolean).join('\n');
      sections.push(makeSection('volume_objective', content, 'approved_intent', [`volume:${currentVolume.volumeKey}`]));
    }

    const contextRefs = Array.isArray(brief?.contextRefs) ? (brief.contextRefs as string[]) : [];
    let unresolvedRefs: string[] = [];
    if (contextRefs.length > 0) {
      const { resolved, unresolved } = await this.resolveRefs(projectId, contextRefs);
      unresolvedRefs = unresolved;
      for (const s of resolved) sections.push(s);
    }

    if (currentDraft?.body) {
      sections.push(makeSection('current_draft', currentDraft.body, 'working', [`chapter:${chapter}`]));
    }

    if (feedbackRows.length > 0) {
      const notes = feedbackRows.map((f, i) => `${i + 1}. ${f.note ?? f.disposition}`).join('\n');
      sections.push(makeSection('feedback', notes, 'working', []));
    }

    if (recentChapters.length > 0) {
      const lines = recentChapters
        .slice()
        .reverse()
        .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
      sections.push(makeSection('memory', lines.join('\n'), 'canonical', []));
    }
    sections.push(makeSection('writing_style', project?.instructions?.trim() || DEFAULT_WRITING_INSTRUCTIONS, 'canonical', []));

    return this.finalize(projectId, 'revision', chapter, sections, unresolvedRefs, budgetTokens, false);
  }

  async forValidationWindow(projectId: bigint, from: number, to: number, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
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

    return this.finalize(projectId, 'validation', null, sections, [], budgetTokens, false);
  }

  /**
   * Builds the pack for one chat turn (design §10.3): stable sections carry the scope's canon,
   * volatile carries only the artifacts whose revision moved since the session started. History is
   * NOT part of the pack — it rides as prompt messages so provider caching can extend across turns.
   */
  async forChatTurn(projectId: bigint, session: ChatScopeInput, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? (session.scopeType === 'project' ? CHAT_HUB_BUDGET : CHAT_PACK_BUDGET);
    const refValue = session.scopeRef?.includes(':') ? (session.scopeRef.split(':')[1] ?? '') : (session.scopeRef ?? '');

    const sections: ContextSection[] = [];
    let unresolvedRefs: string[] = [];

    switch (session.scopeType) {
      // The hub (chat-hub design §6.1): whole-project canon in the stable segment, live pipeline
      // state in the volatile tail — the model is both story editor and showrunner here.
      case 'project': {
        const [project, docs, volumes, arcs, catalogText] = await Promise.all([
          this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
          this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
          this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
          this.db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId), orderBy: [schema.arcs.volumeKey, schema.arcs.ordinal] }),
          this.catalogService.render(projectId),
        ]);
        if (project) sections.push(asStable(makeSection('premise', this.renderPremise(project), 'canonical', ['premise'])));
        if (docs.length > 0) sections.push(asStable(makeSection('doc_inventory', docs.map(d => `${d.section}/${d.slug}: ${firstLine(d.body)}`).join('\n'), 'canonical', [])));
        if (volumes.length > 0) sections.push(asStable(makeSection('volume_plan', volumes.map(v => this.renderVolumeLine(v)).join('\n'), 'approved_intent', [])));
        if (arcs.length > 0) {
          const lines = arcs.map(a => `${a.arcKey} [${a.volumeKey}] (chs ${a.chapterStart ?? '?'}–${a.chapterEnd ?? '?'}, ${a.status}): ${a.title ?? a.objective ?? ''}`);
          sections.push(asStable(makeSection('arc_inventory', lines.join('\n'), 'approved_intent', [])));
        }
        if (catalogText) sections.push(asStable(makeSection('catalog', catalogText, 'canonical', [])));
        sections.push(makeSection('pipeline_status', await this.renderPipelineStatus(projectId, project?.storyCurrentChapter ?? 0), 'working', []));
        break;
      }
      case 'novel': {
        const [project, docs, volumes, catalogText] = await Promise.all([
          this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
          this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
          this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
          this.catalogService.render(projectId),
        ]);
        if (project) sections.push(asStable(makeSection('premise', this.renderPremise(project), 'canonical', ['premise'])));
        if (docs.length > 0) sections.push(asStable(makeSection('doc_inventory', docs.map(d => `${d.section}/${d.slug}: ${firstLine(d.body)}`).join('\n'), 'canonical', [])));
        if (volumes.length > 0) sections.push(asStable(makeSection('volume_plan', volumes.map(v => this.renderVolumeLine(v)).join('\n'), 'approved_intent', [])));
        if (catalogText) sections.push(asStable(makeSection('catalog', catalogText, 'canonical', [])));
        break;
      }
      case 'bible_document': {
        const [section = '', ...rest] = refValue.split('/');
        const [doc, siblings, catalogText] = await Promise.all([
          this.db.query.bibleDocuments.findFirst({
            where: and(
              eq(schema.bibleDocuments.projectId, projectId),
              eq(schema.bibleDocuments.section, section as schema.Bible.Section),
              eq(schema.bibleDocuments.slug, rest.join('/')),
            ),
          }),
          this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
          this.catalogService.render(projectId),
        ]);
        if (doc) sections.push(asStable(makeSection('document', `${doc.section}/${doc.slug}\n\n${doc.body ?? ''}`, 'canonical', [`doc:${doc.section}/${doc.slug}`])));
        if (siblings.length > 0)
          sections.push(asStable(makeSection('doc_inventory', siblings.map(d => `${d.section}/${d.slug}: ${firstLine(d.body)}`).join('\n'), 'canonical', [])));
        if (catalogText) sections.push(asStable(makeSection('catalog', catalogText, 'canonical', [])));
        break;
      }
      case 'volume_plan': {
        const [project, volumes] = await Promise.all([
          this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
          this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
        ]);
        if (project) sections.push(asStable(makeSection('premise', this.renderPremise(project), 'canonical', ['premise'])));
        if (volumes.length > 0) sections.push(asStable(makeSection('volume_plan', volumes.map(v => this.renderVolumeFull(v)).join('\n\n'), 'approved_intent', [])));
        if (project?.skeletonCharacterArcs || project?.skeletonPowerCurve) {
          const skeleton = [project.skeletonPowerCurve, project.skeletonCharacterArcs ? JSON.stringify(project.skeletonCharacterArcs) : ''].filter(Boolean).join('\n\n');
          sections.push(asStable(makeSection('skeleton', skeleton, 'canonical', [])));
        }
        break;
      }
      case 'volume':
      case 'arc_plan': {
        const [volume, allVolumes, arcs, catalogText] = await Promise.all([
          this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, refValue)) }),
          this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
          this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, refValue)), orderBy: schema.arcs.ordinal }),
          this.catalogService.render(projectId),
        ]);
        if (volume) {
          sections.push(asStable(makeSection('volume', this.renderVolumeFull(volume), 'approved_intent', [`volume:${volume.volumeKey}`])));
          const neighbours = allVolumes.filter(v => Math.abs(v.ordinal - volume.ordinal) === 1 && v.epitome);
          if (neighbours.length > 0)
            sections.push(asStable(makeSection('memory', neighbours.map(v => `Vol ${v.ordinal} (${v.title ?? v.volumeKey}): ${v.epitome}`).join('\n'), 'canonical', [])));
        }
        if (arcs.length > 0) sections.push(asStable(makeSection('arcs', arcs.map(a => this.renderArcFull(a)).join('\n\n'), 'approved_intent', [])));
        if (catalogText) sections.push(asStable(makeSection('catalog', catalogText, 'canonical', [])));
        break;
      }
      case 'arc': {
        const arc = await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, refValue)) });
        if (arc) {
          const [volume, siblings, briefs] = await Promise.all([
            this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, arc.volumeKey)) }),
            this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, arc.volumeKey)), orderBy: schema.arcs.ordinal }),
            arc.chapterStart !== null && arc.chapterEnd !== null
              ? this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), between(schema.briefs.chapter, arc.chapterStart, arc.chapterEnd)) })
              : Promise.resolve([]),
          ]);
          sections.push(asStable(makeSection('arc', this.renderArcFull(arc), 'approved_intent', [`arc:${arc.arcKey}`])));
          if (volume) sections.push(asStable(makeSection('volume', this.renderVolumeFull(volume), 'approved_intent', [`volume:${volume.volumeKey}`])));
          const hooks = siblings.filter(s => s.arcKey !== arc.arcKey && s.hook);
          if (hooks.length > 0)
            sections.push(
              asStable(makeSection('sibling_hooks', hooks.map(s => `${s.arcKey} (chs ${s.chapterStart}–${s.chapterEnd}): ${s.hook}`).join('\n'), 'approved_intent', [])),
            );
          if (briefs.length > 0) sections.push(asStable(makeSection('briefs_list', briefs.map(b => `Ch ${b.chapter}: ${b.title ?? ''}`).join('\n'), 'approved_intent', [])));
        }
        break;
      }
      case 'brief': {
        const chapter = parseInt(refValue, 10);
        const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
        if (brief) {
          const contract = brief.endingContract ? `\n\nEnding contract: ${JSON.stringify(brief.endingContract)}` : '';
          const refs = Array.isArray(brief.contextRefs) ? (brief.contextRefs as string[]) : [];
          sections.push(
            asStable(
              makeSection('brief', `Ch ${brief.chapter}: ${brief.title ?? ''}\n\n${brief.body}${contract}\n\nContext refs: ${refs.join(', ')}`, 'approved_intent', [
                `chapter:${chapter}`,
              ]),
            ),
          );
          const [arc, volume] = await Promise.all([
            brief.arcKey ? this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, brief.arcKey)) }) : Promise.resolve(undefined),
            brief.volumeKey
              ? this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, brief.volumeKey)) })
              : Promise.resolve(undefined),
          ]);
          if (arc) sections.push(asStable(makeSection('arc', this.renderArcFull(arc), 'approved_intent', [`arc:${arc.arcKey}`])));
          if (volume)
            sections.push(
              asStable(makeSection('volume_objective', [volume.objective, volume.conflict].filter(Boolean).join('\n'), 'approved_intent', [`volume:${volume.volumeKey}`])),
            );
          if (refs.length > 0) {
            const { resolved, unresolved } = await this.resolveRefs(projectId, refs);
            unresolvedRefs = unresolved;
            for (const section of resolved) sections.push(asStable(section));
          }
          // The chapter's actual prose: refining a drafted chapter is meaningless if the model can only
          // see the brief, so the current draft rides along (working tier — it is not canon yet).
          const draft = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
          if (draft?.body) {
            const { text } = truncateAtParagraph(draft.body, 8_000);
            sections.push(asStable(makeSection('current_draft', `Ch ${chapter} draft (rev ${draft.revision}):\n\n${text}`, 'working', [`chapter:${chapter}`])));
          }
        }
        break;
      }
    }

    // Volatile tail: artifacts whose revision moved since the session started — the model must know
    // the canon under discussion shifted beneath the conversation.
    const changed = await this.changedSince(projectId, session.createdAt);
    if (changed.length > 0) sections.push(makeSection('changed_since', changed.join('\n'), 'working', []));

    const purpose = session.scopeType === 'project' ? 'chat_hub' : 'chat';
    return this.finalize(projectId, purpose, null, sections, unresolvedRefs, budgetTokens, opts && 'dryRun' in opts ? (opts as { dryRun?: boolean }).dryRun : false);
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

  /** Pack for the arc-plan chain (design §10.3): the volume, its neighbours' handoffs, premise, skeleton, catalog. */
  async forArcPlanning(projectId: bigint, volumeKey: string, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
    const budgetTokens = opts?.budgetTokens ?? ARC_PLAN_BUDGET;

    const [project, volumes, catalogText, openThreads, openMysteries] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
      this.catalogService.render(projectId),
      this.db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.status, 'open')) }),
      this.db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.status, 'open')) }),
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
    if (catalogText) sections.push(asStable(makeSection('catalog', catalogText, 'canonical', [])));

    const dormantText = renderDormantThreads(computeDormantThreads(openThreads, openMysteries, project?.storyCurrentChapter ?? 0));
    if (dormantText) sections.push(makeSection('dormant_threads', dormantText, 'working', []));

    return this.finalize(projectId, 'arc_plan', null, sections, [], budgetTokens, false);
  }

  /** Pack for premise enhancement; the bible audit reuses it with a fuller document inventory. */
  async forPremise(projectId: bigint, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'premise', 1, opts?.budgetTokens ?? PREMISE_BUDGET);
  }

  async forAudit(projectId: bigint, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'audit', 5, opts?.budgetTokens ?? AUDIT_BUDGET);
  }

  /**
   * Pack for the rebrand glossary seed (rebrand design §2): the project overview plus every known
   * proper noun the seeder must map — the extracted entity roster (with aliases) and world facts.
   * Both are empty on an unextracted project; the opening chapters travel as a template var instead.
   */
  async forRebrandSeed(projectId: bigint, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
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

    return this.finalize(projectId, 'rebrand_seed', null, sections, [], opts?.budgetTokens ?? REBRAND_SEED_BUDGET, false);
  }

  /**
   * Pack for one chapter conversion (rebrand design §5). World notes and directives are the stable
   * segment (byte-identical across chapters — the provider cache prefix); the glossary slice, carry
   * state, and previous converted ending are volatile. The chapter prose itself travels as a template
   * var so the pack stays cacheable. Callers pass pre-rendered strings — the assembler stays free of
   * rebrand-table knowledge.
   */
  async forRebrand(
    projectId: bigint,
    chapter: number,
    input: { worldNotes: string; directives: string | null; glossarySlice: string; carryState: string | null; prevBody: string | null },
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    if (input.directives) sections.push(asStable(makeSection('directives', input.directives, 'approved_intent', [])));
    sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));
    if (input.carryState) sections.push(makeSection('carry_state', input.carryState, 'working', []));
    if (input.prevBody) sections.push(makeSectionTail('prev_ending', input.prevBody, PREV_ENDING_TAIL, 'canonical', [`conversion:${chapter - 1}`]));

    return this.finalize(projectId, 'rebrand', chapter, sections, [], REBRAND_BUDGET, false);
  }

  /**
   * Pack for one chapter reforge outline (reforge design §5). Only the world notes are stable (the
   * cache prefix, byte-identical across chapters); the glossary slice is volatile. The source prose
   * itself travels as a template var, never in the pack, so the stable segment never churns.
   */
  async forReforgeOutline(projectId: bigint, chapter: number, input: { worldNotes: string; glossarySlice: string }): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));

    return this.finalize(projectId, 'reforge_outline', chapter, sections, [], REFORGE_OUTLINE_BUDGET, false);
  }

  /**
   * Pack for one source-analysis call — a window pass or a synthesis pass (transform design §3.2–3.3).
   * Only the world notes are stable, so the cache prefix stays byte-identical across every window of a
   * run; the glossary slice, the window's signal digest, and the carry-forward state are volatile. The
   * window's source prose and the synthesis card index travel as template vars, never in the pack.
   * `window` is the 1-based window ordinal, or null for a synthesis pass.
   */
  async forReforgeAnalysis(
    projectId: bigint,
    window: number | null,
    input: { worldNotes: string; glossarySlice: string | null; signalDigest: string | null; carryState: string | null },
  ): Promise<AssembledPack & { id: bigint | null }> {
    const sections: ContextSection[] = [asStable(makeSection('world_notes', input.worldNotes, 'canonical', []))];
    if (input.glossarySlice) sections.push(makeSection('glossary_slice', input.glossarySlice, 'canonical', []));
    if (input.signalDigest) sections.push(makeSection('signal_digest', input.signalDigest, 'working', []));
    if (input.carryState) sections.push(makeSection('carry_state', input.carryState, 'working', []));

    return this.finalize(projectId, 'reforge_analysis', window, sections, [], REFORGE_ANALYSIS_BUDGET, false);
  }

  /**
   * Pack for one chapter re-author (reforge design §5). World notes, directives, the author's
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

    return this.finalize(projectId, 'reforge', chapter, sections, [], REFORGE_BUDGET, false);
  }

  /**
   * Pack for composing one image prompt. The art-style bible and the project premise are stable (they
   * bind every illustration in the project); the subject card and the canon that describes how the
   * subject looks are volatile. `subjectKey` is the entity key, the chapter number as text, or null
   * for the project cover.
   */
  async forIllustration(projectId: bigint, subjectType: schema.Illustration.SubjectType, subjectKey: string | null): Promise<AssembledPack & { id: bigint | null }> {
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

    return this.finalize(projectId, 'illustration', subjectType === 'chapter' && subjectKey ? Number(subjectKey) : null, sections, [], ILLUSTRATION_BUDGET, false);
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

  private async premisePack(projectId: bigint, purpose: ContextPurpose, inventoryLines: number, budgetTokens: number): Promise<AssembledPack & { id: bigint | null }> {
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

    return this.finalize(projectId, purpose, null, sections, [], budgetTokens, false);
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

  private renderArcFull(a: schema.Plan.Arc): string {
    return [
      `**${a.title ?? a.arcKey}** (${a.arcKey}, ${a.status}, chs ${a.chapterStart ?? '?'}–${a.chapterEnd ?? '?'})${a.staleReason ? ` [STALE: ${a.staleReason}]` : ''}`,
      `Objective: ${a.objective ?? ''}`,
      `Escalation: ${a.escalation ?? ''}`,
      `Payoff: ${a.payoff ?? ''}`,
      `Hook: ${a.hook ?? ''}`,
      Array.isArray(a.cast) && a.cast.length > 0 ? `Cast: ${(a.cast as string[]).join(', ')}` : '',
      a.body ?? '',
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
    dryRun?: boolean,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const { fitting: fittingSections, omitted } = applyBudget(sections, budgetTokens);
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
    if (!dryRun) {
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
