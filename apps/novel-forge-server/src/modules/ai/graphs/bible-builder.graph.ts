import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { eq, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';

import { type BibleStage, chapterForStage } from '@modules/bible/bible-manifest';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
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
  // Stages skipped because a non-force run found existing content — distinct from `counts`, whose 0
  // already means "ran and produced zero entities" for a stage that emits none.
  skippedStages: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type BibleBuilderState = typeof BibleBuilderAnnotation.State;

const logger = Logger.getLogger(APP_NAME, 'bible-builder.graph');

// Prompt modules are versioned code and the manifest's slugs are data; keeping the mapping explicit
// lets either be renamed without silently repointing the other.
const STAGE_PROMPT_KEY: Record<BibleStage, 'bible:foundation' | 'bible:world' | 'bible:power' | 'bible:factions-locations' | 'bible:characters' | 'bible:plot' | 'bible:volumes'> =
  {
    foundation: 'bible:foundation',
    world: 'bible:world',
    power: 'bible:power',
    factionsAndLocations: 'bible:factions-locations',
    characters: 'bible:characters',
    plot: 'bible:plot',
    volumes: 'bible:volumes',
  };

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createBibleBuilderGraph(services: BibleBuilderServices) {
  const { db, modelRouter, indexingService, checkpointer } = services;

  async function fetchStageDoc(projectId: bigint, stage: BibleStage): Promise<string> {
    const { section, slug } = chapterForStage(stage);
    const doc = await db.query.bibleDocuments.findFirst({
      where: sql`${schema.bibleDocuments.projectId} = ${projectId} AND ${schema.bibleDocuments.section} = ${section} AND ${schema.bibleDocuments.slug} = ${slug}`,
    });
    return doc?.body ?? '';
  }

  async function runStage(state: BibleBuilderState, stage: BibleStage, promptInput: Record<string, unknown>): Promise<Partial<BibleBuilderState>> {
    const projectId = BigInt(state.projectId);
    const { section, slug } = chapterForStage(stage);

    if (!state.force) {
      const existing = await db.query.bibleDocuments.findFirst({
        where: sql`${schema.bibleDocuments.projectId} = ${projectId} AND ${schema.bibleDocuments.section} = ${section} AND ${schema.bibleDocuments.slug} = ${slug}`,
      });
      if (existing?.body) {
        logger.debug(`[bible-builder] Skipping ${stage} — already has content`);
        return { stagesDone: [...state.stagesDone, stage], counts: { ...state.counts, [stage]: 0 }, skippedStages: [stage], nodeTrace: [stage] };
      }
    }

    const promptKey = STAGE_PROMPT_KEY[stage];
    const prompt = PROMPT_REGISTRY[promptKey];
    if (!prompt) throw AppError.internal(`[bible-builder] No prompt for stage: ${stage}`);

    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const ctx: TelemetryContext = { projectId, runId: state.runId, node: stage, promptKey, promptVersion: prompt.version, role: prompt.role ?? promptKey };
    logger.debug('bible-builder runStage', { runId: state.runId, stage, section, slug, force: state.force });

    const result = (await modelRouter.structured(prompt, promptInput, ctx, projectRow as ProjectConfig | undefined)) as BibleStageOutput;

    // A stage's document and its structured records are one unit: a partially-written stage would still
    // satisfy the `existing?.body` skip-check above and never be retried by a non-force rebuild.
    await db.transaction(async tx => {
      await tx
        .insert(schema.bibleDocuments)
        .values({ projectId, section, slug, body: result.body })
        .onConflictDoUpdate({
          target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
          set: { body: sql`EXCLUDED.body`, updatedAt: new Date() },
        });

      for (const e of result.entities ?? []) {
        await tx
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
          });
      }

      for (const f of result.facts ?? []) {
        await tx
          .insert(schema.canonFacts)
          .values({
            projectId,
            factKey: f.factKey,
            text: f.text,
            subjects: f.subjects ?? null,
            constraintNote: f.constraintNote ?? null,
            terms: f.terms ?? null,
            revealChapter: f.revealChapter ?? null,
            source: 'generated',
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
          });
      }

      for (const wf of result.worldFacts ?? []) {
        await tx
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
          });
      }
    });

    return {
      stagesDone: [...state.stagesDone, stage],
      counts: { ...state.counts, [stage]: result.entities?.length ?? 1 },
      nodeTrace: [stage],
    };
  }

  async function foundation(state: BibleBuilderState) {
    return runStage(state, 'foundation', { projectBrief: state.brief });
  }

  async function world(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const foundationBody = await fetchStageDoc(projectId, 'foundation');
    return runStage(state, 'world', { projectBrief: state.brief, foundation: foundationBody });
  }

  async function power(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, worldBody] = await Promise.all([fetchStageDoc(projectId, 'foundation'), fetchStageDoc(projectId, 'world')]);
    return runStage(state, 'power', { projectBrief: state.brief, foundation: foundationBody, world: worldBody });
  }

  async function factionsAndLocations(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, worldBody, powerBody] = await Promise.all([
      fetchStageDoc(projectId, 'foundation'),
      fetchStageDoc(projectId, 'world'),
      fetchStageDoc(projectId, 'power'),
    ]);
    return runStage(state, 'factionsAndLocations', { projectBrief: state.brief, foundation: foundationBody, world: worldBody, power: powerBody });
  }

  async function characters(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, worldBody, powerBody, factionsBody] = await Promise.all([
      fetchStageDoc(projectId, 'foundation'),
      fetchStageDoc(projectId, 'world'),
      fetchStageDoc(projectId, 'power'),
      fetchStageDoc(projectId, 'factionsAndLocations'),
    ]);
    return runStage(state, 'characters', {
      projectBrief: state.brief,
      foundation: foundationBody,
      world: worldBody,
      power: powerBody,
      factionsAndLocations: factionsBody,
    });
  }

  async function plot(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, worldBody, powerBody, charactersBody] = await Promise.all([
      fetchStageDoc(projectId, 'foundation'),
      fetchStageDoc(projectId, 'world'),
      fetchStageDoc(projectId, 'power'),
      fetchStageDoc(projectId, 'characters'),
    ]);
    return runStage(state, 'plot', { projectBrief: state.brief, foundation: foundationBody, world: worldBody, power: powerBody, characters: charactersBody });
  }

  async function volumes(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const [foundationBody, plotBody, charactersBody] = await Promise.all([
      fetchStageDoc(projectId, 'foundation'),
      fetchStageDoc(projectId, 'plot'),
      fetchStageDoc(projectId, 'characters'),
    ]);
    return runStage(state, 'volumes', { projectBrief: state.brief, foundation: foundationBody, plot: plotBody, characters: charactersBody });
  }

  async function indexLore(state: BibleBuilderState) {
    const projectId = BigInt(state.projectId);
    const docs = await db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId) });

    for (const doc of docs) {
      if (!doc.body) continue;
      try {
        await indexingService.addLore(projectId, 'bible_doc', `${doc.section}/${doc.slug}`, doc.body, doc.updatedAt ?? new Date());
      } catch (err) {
        logger.warn('indexLore: addLore failed (non-fatal)', { err, section: doc.section });
      }
    }

    return { outcome: 'completed', nodeTrace: ['indexLore'] };
  }

  return new StateGraph(BibleBuilderAnnotation)
    .addNode('foundation', foundation)
    .addNode('world', world)
    .addNode('power', power)
    .addNode('factionsAndLocations', factionsAndLocations)
    .addNode('characters', characters)
    .addNode('plot', plot)
    .addNode('volumes', volumes)
    .addNode('indexLore', indexLore)
    .addEdge(START, 'foundation')
    .addEdge('foundation', 'world')
    .addEdge('world', 'power')
    .addEdge('power', 'factionsAndLocations')
    .addEdge('factionsAndLocations', 'characters')
    .addEdge('characters', 'plot')
    .addEdge('plot', 'volumes')
    .addEdge('volumes', 'indexLore')
    .addEdge('indexLore', END)
    .compile({ checkpointer });
}
