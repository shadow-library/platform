/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, eq, sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type ContextAssembler } from '../context/context-assembler.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type IndexingService } from '../retrieval/indexing.service';
import { type ExtractionOutput } from '../schemas';
import { type TelemetryContext, type TelemetryHandler } from '../telemetry.handler';
import { type ToolRegistryService } from '../tools/tool-registry.service';

/**
 * Defining types
 */

export interface ExtractionServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  telemetry: TelemetryHandler;
  toolRegistry: ToolRegistryService;
  indexingService: IndexingService;
  checkpointer: BaseCheckpointSaver;
}

const SourceExtractionAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  chapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  chapterId: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  chapterContent: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  chapterGenerator: Annotation<string>({ reducer: (_, n) => n, default: () => 'standard' }),
  extracted: Annotation<ExtractionOutput | null>({ reducer: (_, n) => n, default: () => null }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

type ExtractionState = typeof SourceExtractionAnnotation.State;

/**
 * Declaring the constants
 */

const logger = Logger.getLogger(APP_NAME, 'source-extraction.graph');

export function createSourceExtractionGraph(services: ExtractionServices): ReturnType<typeof buildSourceExtractionGraph> {
  return buildSourceExtractionGraph(services);
}

function buildSourceExtractionGraph(services: ExtractionServices) {
  const { db, modelRouter, indexingService, checkpointer } = services;

  // ─── loadChapter ──────────────────────────────────────────────────────────────
  async function loadChapter(state: ExtractionState) {
    const projectId = BigInt(state.projectId);
    const ch = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, state.chapter)) });

    if (!ch) throw new Error(`[loadChapter] Chapter ${state.chapter} not found for project ${state.projectId}`);

    logger.debug('extraction loadChapter', { runId: state.runId, chapter: state.chapter, chapterId: String(ch.id), contentLength: (ch.content ?? '').length });
    return { chapterId: String(ch.id), chapterContent: ch.content ?? '', chapterGenerator: ch.generator };
  }

  // ─── extractKnowledge ────────────────────────────────────────────────────────
  async function extractKnowledge(state: ExtractionState) {
    const projectId = BigInt(state.projectId);
    const entityRows = await db.query.entities.findMany({
      where: eq(schema.entities.projectId, projectId),
      with: { aliases: true },
      columns: { entityKey: true, name: true, type: true },
    });

    const entityRoster = entityRows.map(e => `${e.entityKey} (${e.type}): ${e.name}`).join('\n');
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'extractKnowledge', promptKey: 'extraction', promptVersion: '1.0.0', role: 'extraction' };

    const result = (await modelRouter.structured(
      PROMPT_REGISTRY.extraction,
      { chapterProse: state.chapterContent, entityRoster },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as ExtractionOutput;

    logger.debug('extraction extractKnowledge', {
      runId: state.runId,
      chapter: state.chapter,
      entities: result.entities.length,
      relationships: result.relationships.length,
      beats: result.beats.length,
      plotThreads: result.plotThreads.length,
      worldFacts: result.worldFacts.length,
      mysteries: result.mysteries.length,
    });
    return { extracted: result };
  }

  // ─── persistKnowledge ────────────────────────────────────────────────────────
  async function persistKnowledge(state: ExtractionState) {
    if (!state.extracted) return {};

    const projectId = BigInt(state.projectId);
    const extracted = state.extracted;
    logger.debug('extraction persistKnowledge', { runId: state.runId, chapter: state.chapter, entities: extracted.entities.length, beats: extracted.beats.length });

    // Upsert entities and aliases.
    for (const e of extracted.entities) {
      const [entity] = await db
        .insert(schema.entities)
        .values({
          projectId,
          entityKey: e.entityKey,
          type: e.type,
          name: e.name,
          attributes: (e.attributes as never) ?? null,
          notes: e.notes ?? null,
          firstSeenChapter: e.firstSeenChapter ?? null,
          origin: 'extracted',
          status: 'active',
        })
        .onConflictDoUpdate({
          target: [schema.entities.projectId, schema.entities.entityKey],
          set: {
            name: sql`COALESCE(EXCLUDED.name, entities.name)`,
            attributes: e.attributes ? sql`COALESCE(entities.attributes, '{}'::jsonb) || EXCLUDED.attributes` : sql`entities.attributes`,
            firstSeenChapter: sql`LEAST(entities.first_seen_chapter, EXCLUDED.first_seen_chapter)`,
            updatedAt: new Date(),
          },
        })
        .returning()
        .catch(err => {
          logger.warn('entity upsert error', { err, entityKey: e.entityKey });
          return [] as (typeof schema.entities.$inferSelect)[];
        });

      if (entity) {
        for (const alias of e.aliases ?? []) {
          await db
            .insert(schema.entityAliases)
            .values({ entityId: entity.id, alias })
            .onConflictDoNothing()
            .catch(() => undefined);
        }
        // Record appearance.
        await db
          .insert(schema.entityAppearances)
          .values({ entityId: entity.id, projectId, chapter: state.chapter })
          .onConflictDoNothing()
          .catch(() => undefined);
      }
    }

    // Upsert relationships.
    for (const rel of extracted.relationships) {
      const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, rel.entityKey)) });
      if (entity) {
        await db
          .insert(schema.entityRelationships)
          .values({ projectId, entityId: entity.id, targetKey: rel.targetKey, kind: rel.kind, note: rel.note ?? null, chapter: state.chapter })
          .onConflictDoNothing()
          .catch(() => undefined);
      }
    }

    // Upsert beats.
    for (const b of extracted.beats) {
      await db
        .insert(schema.beats)
        .values({
          projectId,
          beatKey: b.beatKey,
          chapter: b.chapter,
          beatType: b.beatType ?? null,
          summary: b.summary,
          entities: (b.entities as never) ?? null,
          opensThreads: (b.opensThreads as never) ?? null,
          closesThreads: (b.closesThreads as never) ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.beats.projectId, schema.beats.beatKey],
          set: { summary: sql`COALESCE(EXCLUDED.summary, beats.summary)`, beatType: sql`COALESCE(EXCLUDED.beat_type, beats.beat_type)` },
        })
        .catch(err => logger.warn('beat upsert error', { err, beatKey: b.beatKey }));
    }

    // Upsert plot threads.
    for (const t of extracted.plotThreads) {
      await db
        .insert(schema.plotThreads)
        .values({
          projectId,
          threadKey: t.threadKey,
          status: t.status,
          openedChapter: t.openedChapter ?? null,
          closedChapter: t.closedChapter ?? null,
          summary: t.summary,
          owner: t.owner ?? null,
          payoff: t.payoff ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.plotThreads.projectId, schema.plotThreads.threadKey],
          set: {
            status: sql`EXCLUDED.status`,
            openedChapter: sql`COALESCE(plot_threads.opened_chapter, EXCLUDED.opened_chapter)`,
            closedChapter: sql`COALESCE(EXCLUDED.closed_chapter, plot_threads.closed_chapter)`,
            summary: sql`COALESCE(EXCLUDED.summary, plot_threads.summary)`,
            updatedAt: new Date(),
          },
        })
        .catch(err => logger.warn('plotThread upsert error', { err, threadKey: t.threadKey }));
    }

    // Upsert world facts.
    for (const f of extracted.worldFacts) {
      await db
        .insert(schema.worldFacts)
        .values({ projectId, category: f.category, key: f.key, value: f.value, chapter: state.chapter })
        .onConflictDoUpdate({
          target: [schema.worldFacts.projectId, schema.worldFacts.category, schema.worldFacts.key],
          set: { value: sql`EXCLUDED.value`, chapter: sql`COALESCE(EXCLUDED.chapter, world_facts.chapter)`, updatedAt: new Date() },
        })
        .catch(err => logger.warn('worldFact upsert error', { err, key: f.key }));
    }

    // Upsert mysteries.
    for (const m of extracted.mysteries) {
      await db
        .insert(schema.mysteries)
        .values({
          projectId,
          mysteryKey: m.mysteryKey,
          question: m.question,
          status: m.status,
          openedChapter: m.openedChapter ?? null,
          resolvedChapter: m.resolvedChapter ?? null,
          knownTo: m.knownTo ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.mysteries.projectId, schema.mysteries.mysteryKey],
          set: {
            status: sql`EXCLUDED.status`,
            question: sql`COALESCE(EXCLUDED.question, mysteries.question)`,
            openedChapter: sql`COALESCE(mysteries.opened_chapter, EXCLUDED.opened_chapter)`,
            resolvedChapter: sql`COALESCE(EXCLUDED.resolved_chapter, mysteries.resolved_chapter)`,
            updatedAt: new Date(),
          },
        })
        .catch(err => logger.warn('mystery upsert error', { err, mysteryKey: m.mysteryKey }));
    }

    // Update chapter summary.
    if (extracted.chapterSummary && state.chapterId) {
      await db
        .update(schema.chapters)
        .set({ summary: extracted.chapterSummary, updatedAt: new Date() })
        .where(eq(schema.chapters.id, BigInt(state.chapterId)));
    }

    return {};
  }

  // ─── embedProse ───────────────────────────────────────────────────────────────
  async function embedProse(state: ExtractionState) {
    const projectId = BigInt(state.projectId);
    try {
      if (state.chapterContent) {
        await indexingService.addProse(projectId, state.chapter, state.chapterContent, state.chapterGenerator);
      }
    } catch (err) {
      logger.warn('embedProse: addProse failed (non-fatal)', { err });
    }
    return {};
  }

  function finish() {
    return { outcome: 'completed' };
  }

  return new StateGraph(SourceExtractionAnnotation)
    .addNode('loadChapter', loadChapter)
    .addNode('extractKnowledge', extractKnowledge)
    .addNode('persistKnowledge', persistKnowledge)
    .addNode('embedProse', embedProse)
    .addNode('finish', finish)
    .addEdge(START, 'loadChapter')
    .addEdge('loadChapter', 'extractKnowledge')
    .addEdge('extractKnowledge', 'persistKnowledge')
    .addEdge('persistKnowledge', 'embedProse')
    .addEdge('embedProse', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer });
}
