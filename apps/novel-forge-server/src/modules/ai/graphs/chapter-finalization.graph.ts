/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Logger } from '@shadow-library/common';
import { and, eq, sql } from 'drizzle-orm';

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
import { type ContinuityOutput } from '../schemas';
import { type TelemetryContext, type TelemetryHandler } from '../telemetry.handler';
import { type ToolRegistryService } from '../tools/tool-registry.service';

/**
 * Defining types
 */

export interface FinalizationServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  telemetry: TelemetryHandler;
  toolRegistry: ToolRegistryService;
  indexingService: IndexingService;
}

const ChapterFinalizationAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  chapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  draftId: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  prose: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  summary: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  title: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  continuationState: Annotation<Record<string, string>>({ reducer: (_, n) => n, default: () => ({}) }),
  generator: Annotation<string>({ reducer: (_, n) => n, default: () => 'standard' }),
  continuityDelta: Annotation<ContinuityOutput | null>({ reducer: (_, n) => n, default: () => null }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

type FinalizationState = typeof ChapterFinalizationAnnotation.State;

/**
 * Declaring the constants
 */

const logger = Logger.getLogger(APP_NAME, 'chapter-finalization.graph');

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createChapterFinalizationGraph(services: FinalizationServices) {
  const { db, modelRouter, indexingService } = services;

  // ─── guard ────────────────────────────────────────────────────────────────────
  async function guard(state: FinalizationState) {
    const projectId = BigInt(state.projectId);
    const [draftRow, projectRow] = await Promise.all([
      state.draftId ? db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, state.chapter)) }) : null,
      db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    if (!draftRow || draftRow.reviewStatus !== 'approved')
      throw new Error(`[guard] Draft for chapter ${state.chapter} is not approved (status: ${draftRow?.reviewStatus ?? 'missing'})`);

    const currentChapter = projectRow?.storyCurrentChapter ?? 0;
    if (state.chapter !== currentChapter + 1) {
      throw new Error(`[guard] Chapter ${state.chapter} is not next in sequence (current: ${currentChapter})`);
    }

    return {};
  }

  // ─── commitProse ──────────────────────────────────────────────────────────────
  async function commitProse(state: FinalizationState) {
    const projectId = BigInt(state.projectId);

    // Upsert chapter row (idempotent on projectId + number).
    await db
      .insert(schema.chapters)
      .values({
        projectId,
        number: state.chapter,
        title: state.title || null,
        content: state.prose,
        summary: state.summary || null,
        status: 'done',
        generator: (state.generator as 'standard' | 'grok') || 'standard',
        wordCount: state.prose.split(/\s+/).length,
      })
      .onConflictDoUpdate({
        target: [schema.chapters.projectId, schema.chapters.number],
        set: {
          content: sql`EXCLUDED.content`,
          summary: sql`EXCLUDED.summary`,
          title: sql`EXCLUDED.title`,
          status: sql`EXCLUDED.status`,
          generator: sql`EXCLUDED.generator`,
          wordCount: sql`EXCLUDED.word_count`,
          updatedAt: new Date(),
        },
      });

    // Mark draft as final.
    if (state.draftId) {
      await db
        .update(schema.drafts)
        .set({ status: 'final', reviewStatus: 'final', updatedAt: new Date() })
        .where(eq(schema.drafts.id, BigInt(state.draftId)));
    }

    return {};
  }

  // ─── extractContinuity ────────────────────────────────────────────────────────
  async function extractContinuity(state: FinalizationState) {
    // grok chapters skip continuity extraction.
    if (state.generator === 'grok') return { continuityDelta: null };

    const projectId = BigInt(state.projectId);

    // Build entity roster for the prompt.
    const entityRows = await db.query.entities.findMany({
      where: eq(schema.entities.projectId, projectId),
      with: { aliases: true },
      columns: { entityKey: true, name: true, type: true },
    });
    const entityRoster = entityRows.map(e => `${e.entityKey} (${e.type}): ${e.name}`).join('\n');

    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'extractContinuity', promptKey: 'continuity', promptVersion: '1.0.0', role: 'continuity' };
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const delta = (await modelRouter.structured(
      PROMPT_REGISTRY.continuity,
      { prose: state.prose, entityRoster },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as ContinuityOutput;

    // Upsert continuity proposal.
    const resolvedModel = modelRouter.resolveModel('continuity', projectRow as ProjectConfig | undefined);
    await db
      .insert(schema.continuityProposals)
      .values({ projectId, chapter: state.chapter, proposal: delta as never, model: resolvedModel.model, status: 'pending' })
      .onConflictDoUpdate({
        target: [schema.continuityProposals.projectId, schema.continuityProposals.chapter],
        set: { proposal: sql`EXCLUDED.proposal`, model: sql`EXCLUDED.model`, status: 'pending', updatedAt: new Date() },
      });

    return { continuityDelta: delta };
  }

  // ─── applyContinuity ──────────────────────────────────────────────────────────
  async function applyContinuity(state: FinalizationState) {
    if (!state.continuityDelta) return {};

    const projectId = BigInt(state.projectId);
    const delta = state.continuityDelta;

    // Upsert appeared entities' appearances.
    for (const entityKey of delta.appeared ?? []) {
      const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)) });
      if (entity) {
        await db
          .insert(schema.entityAppearances)
          .values({ entityId: entity.id, projectId, chapter: state.chapter, firstChapter: state.chapter, lastChapter: state.chapter })
          .onConflictDoNothing()
          .catch(err => logger.warn('entityAppearance conflict', { err, entityKey }));
      }
    }

    // Insert new entities.
    for (const ne of delta.newEntities ?? []) {
      const [entity] = await db
        .insert(schema.entities)
        .values({
          projectId,
          entityKey: ne.entityKey,
          name: ne.name,
          type: ne.type,
          notes: ne.notes ?? null,
          origin: 'generated',
          status: 'active',
          firstSeenChapter: state.chapter,
        })
        .onConflictDoUpdate({
          target: [schema.entities.projectId, schema.entities.entityKey],
          set: { name: sql`COALESCE(EXCLUDED.name, entities.name)`, updatedAt: new Date() },
        })
        .returning();
      if (entity) {
        await db
          .insert(schema.entityAppearances)
          .values({ entityId: entity.id, projectId, chapter: state.chapter })
          .onConflictDoNothing()
          .catch(err => logger.warn('newEntity appearance conflict', { err, entityKey: ne.entityKey }));
      }
    }

    // Upsert plot threads.
    for (const t of delta.threads ?? []) {
      await db
        .insert(schema.plotThreads)
        .values({ projectId, threadKey: t.threadKey, status: t.status, openedChapter: state.chapter, summary: t.summary ?? null })
        .onConflictDoUpdate({
          target: [schema.plotThreads.projectId, schema.plotThreads.threadKey],
          set: {
            status: sql`EXCLUDED.status`,
            closedChapter: t.status === 'closed' ? state.chapter : sql`plot_threads.closed_chapter`,
            summary: sql`COALESCE(EXCLUDED.summary, plot_threads.summary)`,
            updatedAt: new Date(),
          },
        })
        .catch(err => logger.warn('plotThread upsert error', { err, threadKey: t.threadKey }));
    }

    // Upsert mysteries.
    for (const m of delta.mysteries ?? []) {
      await db
        .insert(schema.mysteries)
        .values({ projectId, mysteryKey: m.mysteryKey, status: m.status, openedChapter: state.chapter, question: m.question ?? '' })
        .onConflictDoUpdate({
          target: [schema.mysteries.projectId, schema.mysteries.mysteryKey],
          set: {
            status: sql`EXCLUDED.status`,
            resolvedChapter: m.status === 'resolved' ? state.chapter : sql`mysteries.resolved_chapter`,
            question: sql`COALESCE(EXCLUDED.question, mysteries.question)`,
            updatedAt: new Date(),
          },
        })
        .catch(err => logger.warn('mystery upsert error', { err, mysteryKey: m.mysteryKey }));
    }

    // Mark proposal applied.
    await db
      .update(schema.continuityProposals)
      .set({ status: 'applied', appliedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, state.chapter)));

    return {};
  }

  // ─── updateIndexes ────────────────────────────────────────────────────────────
  async function updateIndexes(state: FinalizationState) {
    const projectId = BigInt(state.projectId);

    // Best-effort — never fails the run.
    try {
      await indexingService.addProse(projectId, state.chapter, state.prose, state.generator);
    } catch (err) {
      logger.warn('updateIndexes: addProse failed (non-fatal)', { err });
    }

    const touchedKeys = [...(state.continuityDelta?.appeared ?? []), ...(state.continuityDelta?.newEntities?.map(e => e.entityKey) ?? [])];
    for (const key of touchedKeys) {
      try {
        const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, key)) });
        if (entity) {
          const text = [entity.name, entity.notes, entity.body].filter(Boolean).join('\n');
          if (text) await indexingService.addLore(projectId, 'character', key, text, new Date());
        }
      } catch (err) {
        logger.warn('updateIndexes: addLore failed (non-fatal)', { err, key });
      }
    }

    return {};
  }

  // ─── advanceCursor ────────────────────────────────────────────────────────────
  async function advanceCursor(state: FinalizationState) {
    const projectId = BigInt(state.projectId);
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const currentChapter = project?.storyCurrentChapter ?? 0;

    if (state.chapter > currentChapter) {
      const updateData: Record<string, unknown> = { storyCurrentChapter: state.chapter, updatedAt: new Date() };

      // Check if this chapter is in a new volume.
      const volume = await db.query.volumes.findFirst({
        where: and(
          eq(schema.volumes.projectId, projectId),
          sql`${schema.volumes.startChapter} <= ${state.chapter}`,
          sql`(${schema.volumes.endChapter} IS NULL OR ${schema.volumes.endChapter} >= ${state.chapter})`,
        ),
        orderBy: schema.volumes.ordinal,
      });
      if (volume) updateData.storyCurrentVolumeKey = volume.volumeKey;

      await db
        .update(schema.projects)
        .set(updateData as never)
        .where(eq(schema.projects.id, projectId));
    }

    return {};
  }

  function finish() {
    return { outcome: 'completed' };
  }

  return new StateGraph(ChapterFinalizationAnnotation)
    .addNode('guard', guard)
    .addNode('commitProse', commitProse)
    .addNode('extractContinuity', extractContinuity)
    .addNode('applyContinuity', applyContinuity)
    .addNode('updateIndexes', updateIndexes)
    .addNode('advanceCursor', advanceCursor)
    .addNode('finish', finish)
    .addEdge(START, 'guard')
    .addEdge('guard', 'commitProse')
    .addEdge('commitProse', 'extractContinuity')
    .addEdge('extractContinuity', 'applyContinuity')
    .addEdge('applyContinuity', 'updateIndexes')
    .addEdge('updateIndexes', 'advanceCursor')
    .addEdge('advanceCursor', 'finish')
    .addEdge('finish', END)
    .compile();
}
