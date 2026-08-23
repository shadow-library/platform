import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { eq, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type Bible, type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type ContextAssembler } from '../context/context-assembler.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type IndexingService } from '../retrieval/indexing.service';
import { type BibleStageOutput } from '../schemas';
import { type TelemetryContext, type TelemetryHandler } from '../telemetry.handler';
import { type ToolRegistryService } from '../tools/tool-registry.service';

export interface BibleBuilderServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  telemetry: TelemetryHandler;
  toolRegistry: ToolRegistryService;
  indexingService: IndexingService;
  checkpointer: BaseCheckpointSaver;
}

const BibleBuilderAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  brief: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  force: Annotation<boolean>({ reducer: (_, n) => n, default: () => false }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  stagesDone: Annotation<string[]>({ reducer: (_, n) => n, default: () => [] }),
  counts: Annotation<Record<string, number>>({ reducer: (_, n) => n, default: () => ({}) }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type BibleBuilderState = typeof BibleBuilderAnnotation.State;

const logger = Logger.getLogger(APP_NAME, 'bible-builder.graph');

const STAGE_SECTION_MAP: Record<string, Bible.Section> = {
  foundation: 'project',
  worldAndPower: 'world',
  factionsAndLocations: 'world',
  characters: 'ai',
  plot: 'plot',
  volumes: 'story_state',
};

const STAGE_SLUG_MAP: Record<string, string> = {
  foundation: 'foundation',
  worldAndPower: 'world-power',
  factionsAndLocations: 'factions-locations',
  characters: 'characters',
  plot: 'plot',
  volumes: 'volumes',
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createBibleBuilderGraph(services: BibleBuilderServices) {
  const { db, modelRouter, indexingService, checkpointer } = services;

  async function fetchStageDoc(projectId: bigint, stageName: string): Promise<string | null> {
    const section = STAGE_SECTION_MAP[stageName];
    const slug = STAGE_SLUG_MAP[stageName];
    if (!section || !slug) return null;
    const doc = await db.query.bibleDocuments.findFirst({
      where: sql`${schema.bibleDocuments.projectId} = ${projectId} AND ${schema.bibleDocuments.section} = ${section} AND ${schema.bibleDocuments.slug} = ${slug}`,
    });
    return doc?.body ?? null;
  }

  async function runStage(state: BibleBuilderState, stageName: string, promptInput: Record<string, unknown>): Promise<Partial<BibleBuilderState>> {
    const projectId = BigInt(state.projectId);
    const section = STAGE_SECTION_MAP[stageName];
    const slug = STAGE_SLUG_MAP[stageName];

    if (!section || !slug) throw AppError.internal(`[bible-builder] Unknown stage: ${stageName}`);

    if (!state.force) {
      const existing = await db.query.bibleDocuments.findFirst({
        where: sql`${schema.bibleDocuments.projectId} = ${projectId} AND ${schema.bibleDocuments.section} = ${section} AND ${schema.bibleDocuments.slug} = ${slug}`,
      });
      if (existing?.body) {
        logger.debug(`[bible-builder] Skipping ${stageName} — already has content`);
        return { stagesDone: [...state.stagesDone, stageName], counts: { ...state.counts, [stageName]: 0 }, nodeTrace: [stageName] };
      }
    }

    const promptKey = `bible:${STAGE_SLUG_MAP[stageName]}` as
      'bible:foundation' | 'bible:world-power' | 'bible:factions-locations' | 'bible:characters' | 'bible:plot' | 'bible:volumes';
    const prompt = PROMPT_REGISTRY[promptKey];
    if (!prompt) throw AppError.internal(`[bible-builder] No prompt for stage: ${stageName}`);

    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const ctx: TelemetryContext = { projectId, runId: state.runId, node: stageName, promptKey, promptVersion: '1.0.0', role: promptKey };
    logger.debug('bible-builder runStage', { runId: state.runId, stage: stageName, section, slug, force: state.force });

    const result = (await modelRouter.structured(prompt, promptInput, ctx, projectRow as ProjectConfig | undefined)) as BibleStageOutput;

    // Upsert bible document.
    await db
      .insert(schema.bibleDocuments)
      .values({ projectId, section, slug, body: result.body })
      .onConflictDoUpdate({
        target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
        set: { body: sql`EXCLUDED.body`, updatedAt: new Date() },
      });

    // Upsert entities if present.
    if (result.entities && result.entities.length > 0) {
      for (const e of result.entities) {
        await db
          .insert(schema.entities)
          .values({
            projectId,
            entityKey: e.entityKey,
            name: e.name,
            type: e.type,
            significance: e.significance ?? null,
            notes: e.notes ?? null,
            body: e.body ?? null,
            origin: 'generated',
            status: 'active',
          })
          .onConflictDoUpdate({
            target: [schema.entities.projectId, schema.entities.entityKey],
            set: {
              name: sql`COALESCE(EXCLUDED.name, entities.name)`,
              notes: sql`COALESCE(EXCLUDED.notes, entities.notes)`,
              body: sql`COALESCE(EXCLUDED.body, entities.body)`,
              updatedAt: new Date(),
            },
          })
          .catch(err => logger.warn(`bible-builder entity upsert error`, { err, entityKey: e.entityKey }));
      }
    }

    // Upsert canon facts if present.
    if (result.facts && result.facts.length > 0) {
      for (const f of result.facts) {
        await db
          .insert(schema.canonFacts)
          .values({
            projectId,
            factKey: f.factKey,
            text: f.text,
            subjects: f.subjects ?? null,
            constraintNote: f.constraintNote ?? null,
            terms: f.terms ?? null,
            revealChapter: f.revealChapter ?? null,
          })
          .onConflictDoUpdate({
            target: [schema.canonFacts.projectId, schema.canonFacts.factKey],
            set: {
              text: sql`COALESCE(EXCLUDED.text, canon_facts.text)`,
              subjects: sql`COALESCE(EXCLUDED.subjects, canon_facts.subjects)`,
              constraintNote: sql`COALESCE(EXCLUDED.constraint_note, canon_facts.constraint_note)`,
              terms: sql`COALESCE(EXCLUDED.terms, canon_facts.terms)`,
              revealChapter: sql`COALESCE(EXCLUDED.reveal_chapter, canon_facts.reveal_chapter)`,
              updatedAt: new Date(),
            },
          })
          .catch(err => logger.warn(`bible-builder fact upsert error`, { err, factKey: f.factKey }));
      }
    }

    // Upsert world facts if present.
    if (result.worldFacts && result.worldFacts.length > 0) {
      for (const wf of result.worldFacts) {
        await db
          .insert(schema.worldFacts)
          .values({
            projectId,
            category: wf.category,
            key: wf.key,
            value: wf.value,
            chapter: wf.chapter ?? null,
          })
          .onConflictDoUpdate({
            target: [schema.worldFacts.projectId, schema.worldFacts.category, schema.worldFacts.key],
            set: {
              value: sql`COALESCE(EXCLUDED.value, world_facts.value)`,
              chapter: sql`COALESCE(EXCLUDED.chapter, world_facts.chapter)`,
              updatedAt: new Date(),
            },
          })
          .catch(err => logger.warn(`bible-builder world fact upsert error`, { err, category: wf.category, key: wf.key }));
      }
    }

    return {
      stagesDone: [...state.stagesDone, stageName],
      counts: { ...state.counts, [stageName]: result.entities?.length ?? 1 },
      nodeTrace: [stageName],
    };
  }

  async function foundation(state: BibleBuilderState) {
    return runStage(state, 'foundation', { projectBrief: state.brief });
  }

  async function worldAndPower(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const foundationBody = await fetchStageDoc(projectId, 'foundation');
    return runStage(state, 'worldAndPower', { projectBrief: state.brief, foundation: foundationBody ?? '' });
  }

  async function factionsAndLocations(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, worldBody] = await Promise.all([fetchStageDoc(projectId, 'foundation'), fetchStageDoc(projectId, 'worldAndPower')]);
    return runStage(state, 'factionsAndLocations', { projectBrief: state.brief, foundation: foundationBody ?? '', worldAndPower: worldBody ?? '' });
  }

  async function characters(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, worldBody, factionsBody] = await Promise.all([
      fetchStageDoc(projectId, 'foundation'),
      fetchStageDoc(projectId, 'worldAndPower'),
      fetchStageDoc(projectId, 'factionsAndLocations'),
    ]);
    return runStage(state, 'characters', { projectBrief: state.brief, foundation: foundationBody ?? '', worldAndPower: worldBody ?? '', factionsAndLocations: factionsBody ?? '' });
  }

  async function plot(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, worldBody, factionsBody, charsBody] = await Promise.all([
      fetchStageDoc(projectId, 'foundation'),
      fetchStageDoc(projectId, 'worldAndPower'),
      fetchStageDoc(projectId, 'factionsAndLocations'),
      fetchStageDoc(projectId, 'characters'),
    ]);
    return runStage(state, 'plot', {
      projectBrief: state.brief,
      foundation: foundationBody ?? '',
      worldAndPower: worldBody ?? '',
      factionsAndLocations: factionsBody ?? '',
      characters: charsBody ?? '',
    });
  }

  async function volumes(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, plotBody, charsBody] = await Promise.all([
      fetchStageDoc(projectId, 'foundation'),
      fetchStageDoc(projectId, 'plot'),
      fetchStageDoc(projectId, 'characters'),
    ]);
    return runStage(state, 'volumes', { projectBrief: state.brief, foundation: foundationBody ?? '', characters: charsBody ?? '', plot: plotBody ?? '' });
  }

  async function indexLore(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const docs = await db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId) });

    for (const doc of docs) {
      if (!doc.body) continue;
      try {
        await indexingService.addLore(projectId, 'bible_doc', `${doc.section}:${doc.slug}`, doc.body, doc.updatedAt ?? new Date());
      } catch (err) {
        logger.warn('indexLore: addLore failed (non-fatal)', { err, section: doc.section });
      }
    }

    return { outcome: 'completed', nodeTrace: ['indexLore'] };
  }

  return new StateGraph(BibleBuilderAnnotation)
    .addNode('foundation', foundation)
    .addNode('worldAndPower', worldAndPower)
    .addNode('factionsAndLocations', factionsAndLocations)
    .addNode('characters', characters)
    .addNode('plot', plot)
    .addNode('volumes', volumes)
    .addNode('indexLore', indexLore)
    .addEdge(START, 'foundation')
    .addEdge('foundation', 'worldAndPower')
    .addEdge('worldAndPower', 'factionsAndLocations')
    .addEdge('factionsAndLocations', 'characters')
    .addEdge('characters', 'plot')
    .addEdge('plot', 'volumes')
    .addEdge('volumes', 'indexLore')
    .addEdge('indexLore', END)
    .compile({ checkpointer });
}
