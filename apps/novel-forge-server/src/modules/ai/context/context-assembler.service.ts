/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';
import { and, between, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { CatalogService } from './catalog.service';
import { type AssembledPack, type ContextPurpose, type ContextSection, type ContextSegment, type ContextTier, joinSections, renderSection } from './sections';
import { applyBudget, countTokens, truncateAtParagraph, truncateAtParagraphTail } from './token-budget';
import { type RetrievalHit, RetrievalService } from '../retrieval';

/**
 * Defining types
 */

export interface ChatScopeInput {
  scopeType: schema.Refinement.ChatScope;
  scopeRef: string | null;
  createdAt: Date;
}

/**
 * Declaring the constants
 */

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
export const CHAT_HISTORY_BUDGET = 6_000;
export const CHAT_SUMMARY_BUDGET = 1_500;
export const ARC_PLAN_BUDGET = 16_000;
export const PREMISE_BUDGET = 8_000;
export const AUDIT_BUDGET = 12_000;

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
    // Group refs by type for batched queries.
    const entityKeys: string[] = [];
    const worldFactCategories: string[] = [];
    const threadKeys: string[] = [];
    const mysteryKeys: string[] = [];
    const chapterNumbers: number[] = [];
    const volumeKeys: string[] = [];
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
        default:
          unknownRefs.push(ref);
      }
    }

    // Batch fetch all types in parallel.
    const [entitiesRows, worldFactRows, threadRows, mysteryRows, chapterRows, volumeRows] = await Promise.all([
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
    ]);

    // Build lookup maps.
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

    const resolved: ContextSection[] = [];
    const unresolved: string[] = [];

    // Process refs in input order to preserve priority.
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

    const sections: ContextSection[] = [];

    // a. prev_ending
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
    }

    // b. continuation_state
    const prevState = prevDraft?.state;
    if (prevState != null) {
      const content = typeof prevState === 'string' ? prevState : JSON.stringify(prevState);
      sections.push(makeSection('continuation_state', content, 'working', [`chapter:${chapter - 1}`]));
    }

    // c. brief
    if (brief) {
      sections.push(makeSection('brief', brief.body, 'approved_intent', [`chapter:${chapter}`]));
    }

    // d. volume_objective
    if (currentVolume) {
      const content = [currentVolume.objective, currentVolume.conflict].filter(Boolean).join('\n');
      sections.push(makeSection('volume_objective', content, 'approved_intent', [`volume:${currentVolume.volumeKey}`]));
    }

    // e. Resolve contextRefs from brief
    const contextRefs = Array.isArray(brief?.contextRefs) ? (brief.contextRefs as string[]) : [];
    let unresolvedRefs: string[] = [];
    let refSections: ContextSection[] = [];

    if (contextRefs.length > 0) {
      const { resolved, unresolved } = await this.resolveRefs(projectId, contextRefs);
      unresolvedRefs = unresolved;
      refSections = resolved;
    }

    // Apply FULL_CAST_MAX: entity sections beyond FULL_CAST_MAX move to lowest priority.
    const entityRefSections = refSections.filter(s => s.key.startsWith('ref:entity:'));
    const nonEntityRefSections = refSections.filter(s => !s.key.startsWith('ref:entity:'));
    const priorityEntitySections = entityRefSections.slice(0, FULL_CAST_MAX);
    const excessEntitySections = entityRefSections.slice(FULL_CAST_MAX);

    // Insert priority ref sections here, excess goes after memory/writing_style.
    for (const s of [...priorityEntitySections, ...nonEntityRefSections]) sections.push(s);

    // f. memory
    if (recentChapters.length > 0) {
      const lines = recentChapters
        .slice()
        .reverse()
        .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
      sections.push(makeSection('memory', lines.join('\n'), 'canonical', []));
    }

    // g. writing_style
    if (project?.instructions) {
      sections.push(makeSection('writing_style', project.instructions, 'canonical', []));
    }

    // Excess entity sections go at lowest priority.
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

    // 1. volume_objective
    if (currentVolume) {
      const parts = [currentVolume.objective, currentVolume.conflict, currentVolume.payoff].filter(Boolean);
      sections.push(makeSection('volume_objective', parts.join('\n'), 'approved_intent', [`volume:${currentVolume.volumeKey}`]));
    }

    // 2. memory — volume epitomes + recent chapter summaries
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

    // 3. catalog (lowest priority)
    const catalogText = await this.catalogService.render(projectId);
    if (catalogText) {
      sections.push(makeSection('catalog', catalogText, 'canonical', []));
    }

    // 4. Retrieval hits — best-effort; empty degrades gracefully.
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

    // 1. prev_ending
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

    // 2. continuation_state
    const prevState = prevDraft?.state;
    if (prevState != null) {
      const content = typeof prevState === 'string' ? prevState : JSON.stringify(prevState);
      sections.push(makeSection('continuation_state', content, 'working', [`chapter:${chapter - 1}`]));
    }

    // 3. brief + volume_objective
    if (brief) sections.push(makeSection('brief', brief.body, 'approved_intent', [`chapter:${chapter}`]));
    if (currentVolume) {
      const content = [currentVolume.objective, currentVolume.conflict].filter(Boolean).join('\n');
      sections.push(makeSection('volume_objective', content, 'approved_intent', [`volume:${currentVolume.volumeKey}`]));
    }

    // 4. Re-resolve contextRefs fresh
    const contextRefs = Array.isArray(brief?.contextRefs) ? (brief.contextRefs as string[]) : [];
    let unresolvedRefs: string[] = [];
    if (contextRefs.length > 0) {
      const { resolved, unresolved } = await this.resolveRefs(projectId, contextRefs);
      unresolvedRefs = unresolved;
      for (const s of resolved) sections.push(s);
    }

    // 5. Current draft prose
    if (currentDraft?.body) {
      sections.push(makeSection('current_draft', currentDraft.body, 'working', [`chapter:${chapter}`]));
    }

    // 6. Feedback
    if (feedbackRows.length > 0) {
      const notes = feedbackRows.map((f, i) => `${i + 1}. ${f.note ?? f.disposition}`).join('\n');
      sections.push(makeSection('feedback', notes, 'working', []));
    }

    // memory + writing_style (lower priority, helps with coherence)
    if (recentChapters.length > 0) {
      const lines = recentChapters
        .slice()
        .reverse()
        .map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
      sections.push(makeSection('memory', lines.join('\n'), 'canonical', []));
    }
    if (project?.instructions) {
      sections.push(makeSection('writing_style', project.instructions, 'canonical', []));
    }

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

    // 1. Chapter summaries for the window
    if (chapterRows.length > 0) {
      const lines = chapterRows.map((c, i) => `${i + 1}. Ch ${c.number}: ${c.summary ?? ''}`);
      sections.push(makeSection('chapter_window', lines.join('\n'), 'canonical', []));
    }

    // 2. Plot threads touching the window
    if (threadRows.length > 0) {
      const lines = threadRows.map(t => `**${t.threadKey}** (${t.status}${t.intentionallyOpen ? ', intentionally open — do not flag as unresolved' : ''}): ${t.summary ?? ''}`);
      sections.push(makeSection('plot_threads', lines.join('\n'), 'canonical', []));
    }

    // 3. Mysteries touching the window
    if (mysteryRows.length > 0) {
      const lines = mysteryRows.map(m => `**${m.mysteryKey}** (${m.status}${m.intentionallyOpen ? ', intentionally open — do not flag as unresolved' : ''}): ${m.question}`);
      sections.push(makeSection('mysteries', lines.join('\n'), 'canonical', []));
    }

    // 4. World facts (all categories)
    if (worldFactRows.length > 0) {
      const byCategory = new Map<string, string[]>();
      for (const f of worldFactRows) {
        if (!byCategory.has(f.category)) byCategory.set(f.category, []);
        const catEntries = byCategory.get(f.category);
        if (catEntries) catEntries.push(`${f.key}: ${f.value}`);
      }
      const lines: string[] = [];
      for (const [cat, entries] of byCategory) {
        lines.push(`${cat}:\n${entries.join('\n')}`);
      }
      sections.push(makeSection('world_facts', lines.join('\n\n'), 'canonical', []));
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

    const [project, volumes, catalogText] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal }),
      this.catalogService.render(projectId),
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

    return this.finalize(projectId, 'arc_plan', null, sections, [], budgetTokens, false);
  }

  /** Pack for premise enhancement; the bible audit reuses it with a fuller document inventory. */
  async forPremise(projectId: bigint, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'premise', 1, opts?.budgetTokens ?? PREMISE_BUDGET);
  }

  async forAudit(projectId: bigint, opts?: { budgetTokens?: number }): Promise<AssembledPack & { id: bigint | null }> {
    return this.premisePack(projectId, 'audit', 5, opts?.budgetTokens ?? AUDIT_BUDGET);
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
    const fittingSections = applyBudget(sections, budgetTokens);
    // Stable sections render first so the prefix stays byte-identical across calls with unchanged
    // canon (the provider prompt-cache contract); callers list stable sections first, so for the
    // legacy all-volatile purposes this is a no-op.
    const stableSections = fittingSections.filter(s => s.segment === 'stable');
    const volatileSections = fittingSections.filter(s => s.segment !== 'stable');
    const renderedStable = joinSections(stableSections);
    const renderedVolatile = joinSections(volatileSections);
    const rendered = joinSections([...stableSections, ...volatileSections]);
    const usedTokens = fittingSections.reduce((sum, s) => sum + s.tokens, 0);
    const hash = createHash('sha256').update(rendered).digest('hex');

    let id: bigint | null = null;
    if (!dryRun) {
      const [inserted] = await this.db
        .insert(schema.contextPacks)
        .values({ projectId, purpose, chapter, hash, budgetTokens, usedTokens, sections: fittingSections as never, unresolvedRefs, rendered })
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

    return { projectId, purpose, chapter, budgetTokens, usedTokens, sections: fittingSections, unresolvedRefs, renderedStable, renderedVolatile, rendered, id };
  }
}
