import { and, asc, eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { ModelRouterService } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { type ExtractionOutput } from '../ai/schemas/extraction.schema';
import { type TelemetryContext } from '../ai/telemetry.handler';
import { ConsolidateService } from './consolidate.service';
import { KnowledgeRepository } from './knowledge.repository';

export interface ExtractBatchOptions {
  limit?: number;
}

export interface ExtractBatchResult {
  done: number;
}

export const DEFAULT_EXTRACT_LIMIT = 5;

/**
 * Direct extraction service — wraps KnowledgeRepository + ModelRouterService.
 *
 * This is a simpler alternative to the LangGraph source-extraction graph: it
 * calls the LLM directly (no LangGraph state machine) and persists via
 * KnowledgeRepository, giving a lightweight extraction path for batch jobs.
 */
@Injectable()
export class ExtractionService {
  private readonly logger = Logger.getLogger(APP_NAME, ExtractionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly consolidateService: ConsolidateService,
    private readonly modelRouter: ModelRouterService,
    private readonly indexingService: IndexingService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async extractChapter(projectId: bigint, chapterNumber: number): Promise<void> {
    this.logger.debug('extractChapter: starting', { projectId, chapterNumber });
    const chapter = await this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapterNumber)) });
    if (!chapter?.content) {
      this.logger.warn('extractChapter: chapter not found or empty', { projectId, chapterNumber });
      return;
    }

    const entityRows = await this.db.query.entities.findMany({
      where: eq(schema.entities.projectId, projectId),
      columns: { entityKey: true, type: true, name: true },
      limit: 200,
    });
    const entityRoster = entityRows.map(e => `${e.entityKey} (${e.type}): ${e.name}`).join('\n');

    const projectRow = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const ctx: TelemetryContext = {
      projectId,
      runId: `extract-${projectId}-${chapterNumber}`,
      node: 'extractChapter',
      promptKey: 'extraction',
      promptVersion: '1.0.0',
      role: 'extraction',
    };

    const result = (await this.modelRouter.structured(
      PROMPT_REGISTRY.extraction,
      { chapterProse: chapter.content, entityRoster, contextPack: '', chapterNumber },
      ctx,
      projectRow as Parameters<ModelRouterService['structured']>[3],
    )) as ExtractionOutput;

    this.logger.debug('extractChapter: extracted knowledge', {
      projectId,
      chapterNumber,
      entities: result.entities.length,
      relationships: result.relationships.length,
      beats: result.beats.length,
      plotThreads: result.plotThreads.length,
      worldFacts: result.worldFacts.length,
      mysteries: result.mysteries.length,
    });

    for (const e of result.entities) {
      const entity = await this.knowledgeRepository.upsertEntity(projectId, {
        entityKey: e.entityKey,
        type: e.type,
        name: e.name,
        attributes: e.attributes as Record<string, string> | undefined,
        notes: e.notes,
        firstSeenChapter: e.firstSeenChapter,
        origin: 'extracted',
        status: 'active',
      });
      for (const alias of e.aliases ?? []) await this.knowledgeRepository.upsertEntityAlias(entity.id, alias);
      await this.knowledgeRepository.addAppearance({ entityId: entity.id, projectId, chapter: chapterNumber });

      for (const rel of result.relationships.filter(r => r.entityKey === e.entityKey)) {
        await this.knowledgeRepository.addRelationshipObservation({
          entityId: entity.id,
          projectId,
          targetKey: rel.targetKey,
          kind: rel.kind,
          chapter: chapterNumber,
          note: rel.note,
        });
      }
    }

    for (const b of result.beats)
      await this.knowledgeRepository.upsertBeat(projectId, {
        beatKey: b.beatKey,
        chapter: b.chapter,
        beatType: b.beatType,
        summary: b.summary,
        entities: b.entities,
        opensThreads: b.opensThreads,
        closesThreads: b.closesThreads,
      });
    for (const t of result.plotThreads)
      await this.knowledgeRepository.upsertPlotThread(projectId, {
        threadKey: t.threadKey,
        status: t.status,
        openedChapter: t.openedChapter,
        closedChapter: t.closedChapter,
        summary: t.summary,
        owner: t.owner,
        payoff: t.payoff,
      });
    for (const f of result.worldFacts) await this.knowledgeRepository.upsertWorldFact(projectId, { category: f.category, key: f.key, value: f.value, chapter: chapterNumber });
    for (const m of result.mysteries)
      await this.knowledgeRepository.upsertMystery(projectId, {
        mysteryKey: m.mysteryKey,
        question: m.question,
        status: m.status,
        openedChapter: m.openedChapter,
        resolvedChapter: m.resolvedChapter,
        knownTo: m.knownTo,
      });

    if (result.chapterSummary) {
      await this.db
        .update(schema.chapters)
        .set({ summary: result.chapterSummary, updatedAt: new Date() })
        .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapterNumber)));
    }

    try {
      await this.indexingService.addProse(projectId, chapterNumber, chapter.content, chapter.generator);
    } catch (err) {
      this.logger.warn('extractChapter: addProse failed (non-fatal)', { err });
    }

    await this.consolidateService.consolidate(projectId);
    this.logger.debug('extractChapter: done', { projectId, chapterNumber });
  }

  /**
   * Finalized chapters (`status = 'done'`) that have never had knowledge extraction run — no chapter
   * summary was ever written by the extraction pass. Ordered by chapter number ascending, capped at
   * `limit`, for use as an enqueue-time backfill target list.
   */
  async resolvePendingChapters(projectId: bigint, limit: number): Promise<number[]> {
    const chapters = await this.db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'), isNull(schema.chapters.summary)),
      columns: { number: true },
      orderBy: [asc(schema.chapters.number)],
      limit,
    });
    return chapters.map(ch => ch.number);
  }

  async extractBatch(projectId: bigint, options: ExtractBatchOptions = {}): Promise<ExtractBatchResult> {
    const limit = options.limit ?? DEFAULT_EXTRACT_LIMIT;
    const chapterNumbers = await this.resolvePendingChapters(projectId, limit);
    this.logger.info('extractBatch: starting', { projectId, pending: chapterNumbers.length, limit });

    let done = 0;
    for (const chapter of chapterNumbers) {
      try {
        await this.extractChapter(projectId, chapter);
        done++;
      } catch (err) {
        this.logger.error('extractBatch: extractChapter failed', { projectId, chapter, err });
      }
    }

    this.logger.info('extractBatch: complete', { projectId, done, attempted: chapterNumbers.length });
    return { done };
  }
}
