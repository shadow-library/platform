/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type Job, type Knowledge, type PrimaryDatabase, schema, type Story } from '@server/database';

/**
 * Defining types
 */

export type UpsertEntityInput = Pick<Knowledge.Entity, 'entityKey' | 'type' | 'name'> &
  Partial<Pick<Knowledge.Entity, 'attributes' | 'significance' | 'firstSeenChapter' | 'status' | 'origin' | 'notes' | 'motivation' | 'body' | 'imagePath'>>;

export type UpsertBeatInput = Pick<Story.Beat, 'beatKey' | 'chapter'> & Partial<Pick<Story.Beat, 'beatType' | 'summary' | 'entities' | 'opensThreads' | 'closesThreads'>>;

export type UpsertPlotThreadInput = Pick<Story.PlotThread, 'threadKey' | 'status'> &
  Partial<Pick<Story.PlotThread, 'openedChapter' | 'closedChapter' | 'summary' | 'owner' | 'payoff'>>;

export type UpsertWorldFactInput = Pick<Story.WorldFact, 'category' | 'key' | 'value'> & Partial<Pick<Story.WorldFact, 'chapter'>>;

export type UpsertMysteryInput = Pick<Story.Mystery, 'mysteryKey' | 'question' | 'status'> & Partial<Pick<Story.Mystery, 'openedChapter' | 'resolvedChapter' | 'knownTo'>>;

export interface AddAppearanceInput {
  entityId: bigint;
  projectId: bigint;
  chapter: number;
  firstChapter?: number | null;
  lastChapter?: number | null;
  seenChapters?: unknown;
}

export interface AddRelObservationInput {
  entityId: bigint;
  projectId: bigint;
  targetKey: string;
  kind: string;
  chapter: number;
  note?: string | null;
}

export interface WorkSummary {
  pending: number;
  inProgress: number;
  done: number;
  failed: number;
  parked: number;
}

export interface CorpusStats {
  chaptersTotal: number;
  chaptersExtracted: number;
  entitiesTotal: number;
  draftsTotal: number;
  draftsFinal: number;
  volumesTotal: number;
}

/**
 * Declaring the constants
 */

@Injectable()
export class KnowledgeRepository {
  private readonly logger = Logger.getLogger(APP_NAME, KnowledgeRepository.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async upsertEntity(projectId: bigint, data: UpsertEntityInput): Promise<Knowledge.Entity> {
    const [entity] = await this.db
      .insert(schema.entities)
      .values({
        projectId,
        entityKey: data.entityKey,
        type: data.type,
        name: data.name,
        attributes: data.attributes,
        significance: data.significance,
        firstSeenChapter: data.firstSeenChapter,
        status: data.status,
        origin: data.origin,
        notes: data.notes,
        motivation: data.motivation,
        body: data.body,
        imagePath: data.imagePath,
      })
      .onConflictDoUpdate({
        target: [schema.entities.projectId, schema.entities.entityKey],
        set: {
          name: data.name,
          attributes: data.attributes !== undefined ? sql`COALESCE(entities.attributes, '{}'::jsonb) || EXCLUDED.attributes` : sql`entities.attributes`,
          firstSeenChapter: data.firstSeenChapter !== undefined ? sql`LEAST(entities.first_seen_chapter, EXCLUDED.first_seen_chapter)` : sql`entities.first_seen_chapter`,
          status: sql`COALESCE(EXCLUDED.status, entities.status)`,
          significance: sql`COALESCE(EXCLUDED.significance, entities.significance)`,
          origin: sql`COALESCE(EXCLUDED.origin, entities.origin)`,
          notes: sql`COALESCE(EXCLUDED.notes, entities.notes)`,
          motivation: sql`COALESCE(EXCLUDED.motivation, entities.motivation)`,
          body: sql`COALESCE(EXCLUDED.body, entities.body)`,
          imagePath: sql`COALESCE(EXCLUDED.image_path, entities.image_path)`,
          updatedAt: new Date(),
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!entity) throw new Error('[KnowledgeRepository] upsertEntity: unexpected null result');
    return entity;
  }

  async upsertEntityAlias(entityId: bigint, alias: string): Promise<void> {
    await this.db
      .insert(schema.entityAliases)
      .values({ entityId, alias })
      .onConflictDoNothing()
      .catch(err => this.databaseService.translateError(err));
  }

  async addAppearance(input: AddAppearanceInput): Promise<void> {
    await this.db
      .insert(schema.entityAppearances)
      .values({
        entityId: input.entityId,
        projectId: input.projectId,
        chapter: input.chapter,
        firstChapter: input.firstChapter,
        lastChapter: input.lastChapter,
        seenChapters: input.seenChapters,
      })
      .onConflictDoNothing()
      .catch(err => this.databaseService.translateError(err));
  }

  async addRelationshipObservation(input: AddRelObservationInput): Promise<void> {
    await this.db
      .insert(schema.relationshipObservations)
      .values({ entityId: input.entityId, projectId: input.projectId, targetKey: input.targetKey, kind: input.kind, chapter: input.chapter, note: input.note })
      .onConflictDoNothing()
      .catch(err => this.databaseService.translateError(err));
  }

  async upsertBeat(projectId: bigint, data: UpsertBeatInput): Promise<Story.Beat> {
    const [beat] = await this.db
      .insert(schema.beats)
      .values({
        projectId,
        beatKey: data.beatKey,
        chapter: data.chapter,
        beatType: data.beatType,
        summary: data.summary,
        entities: data.entities,
        opensThreads: data.opensThreads,
        closesThreads: data.closesThreads,
      })
      .onConflictDoUpdate({
        target: [schema.beats.projectId, schema.beats.beatKey],
        set: {
          chapter: data.chapter,
          beatType: sql`COALESCE(EXCLUDED.beat_type, beats.beat_type)`,
          summary: sql`COALESCE(EXCLUDED.summary, beats.summary)`,
          entities: sql`COALESCE(EXCLUDED.entities, beats.entities)`,
          opensThreads: sql`COALESCE(EXCLUDED.opens_threads, beats.opens_threads)`,
          closesThreads: sql`COALESCE(EXCLUDED.closes_threads, beats.closes_threads)`,
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!beat) throw new Error('[KnowledgeRepository] upsertBeat: unexpected null result');
    return beat;
  }

  async upsertPlotThread(projectId: bigint, data: UpsertPlotThreadInput): Promise<Story.PlotThread> {
    const [thread] = await this.db
      .insert(schema.plotThreads)
      .values({
        projectId,
        threadKey: data.threadKey,
        status: data.status,
        openedChapter: data.openedChapter,
        closedChapter: data.closedChapter,
        summary: data.summary,
        owner: data.owner,
        payoff: data.payoff,
      })
      .onConflictDoUpdate({
        target: [schema.plotThreads.projectId, schema.plotThreads.threadKey],
        set: {
          status: data.status,
          openedChapter: sql`COALESCE(plot_threads.opened_chapter, EXCLUDED.opened_chapter)`,
          closedChapter: sql`COALESCE(EXCLUDED.closed_chapter, plot_threads.closed_chapter)`,
          summary: sql`COALESCE(EXCLUDED.summary, plot_threads.summary)`,
          owner: sql`COALESCE(EXCLUDED.owner, plot_threads.owner)`,
          payoff: sql`COALESCE(EXCLUDED.payoff, plot_threads.payoff)`,
          updatedAt: new Date(),
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!thread) throw new Error('[KnowledgeRepository] upsertPlotThread: unexpected null result');
    return thread;
  }

  async upsertWorldFact(projectId: bigint, data: UpsertWorldFactInput): Promise<Story.WorldFact> {
    const [fact] = await this.db
      .insert(schema.worldFacts)
      .values({ projectId, category: data.category, key: data.key, value: data.value, chapter: data.chapter })
      .onConflictDoUpdate({
        target: [schema.worldFacts.projectId, schema.worldFacts.category, schema.worldFacts.key],
        set: {
          value: data.value,
          chapter: data.chapter ?? sql`world_facts.chapter`,
          updatedAt: new Date(),
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!fact) throw new Error('[KnowledgeRepository] upsertWorldFact: unexpected null result');
    return fact;
  }

  async upsertMystery(projectId: bigint, data: UpsertMysteryInput): Promise<Story.Mystery> {
    const [mystery] = await this.db
      .insert(schema.mysteries)
      .values({
        projectId,
        mysteryKey: data.mysteryKey,
        question: data.question,
        status: data.status,
        openedChapter: data.openedChapter,
        resolvedChapter: data.resolvedChapter,
        knownTo: data.knownTo,
      })
      .onConflictDoUpdate({
        target: [schema.mysteries.projectId, schema.mysteries.mysteryKey],
        set: {
          status: data.status,
          openedChapter: sql`COALESCE(mysteries.opened_chapter, EXCLUDED.opened_chapter)`,
          resolvedChapter: sql`COALESCE(EXCLUDED.resolved_chapter, mysteries.resolved_chapter)`,
          question: sql`COALESCE(EXCLUDED.question, mysteries.question)`,
          knownTo: sql`COALESCE(EXCLUDED.known_to, mysteries.known_to)`,
          updatedAt: new Date(),
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!mystery) throw new Error('[KnowledgeRepository] upsertMystery: unexpected null result');
    return mystery;
  }

  async workSummary(projectId: bigint, maxAttempts = 3): Promise<WorkSummary> {
    const [pending, inProgress, done, failedAll] = await Promise.all([
      this.db.$count(schema.jobs, and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'pending'))),
      this.db.$count(schema.jobs, and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'in_progress'))),
      this.db.$count(schema.jobs, and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'done'))),
      this.db.query.jobs.findMany({ where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'failed')) }),
    ]);

    const failed = failedAll.filter(j => j.attempts < maxAttempts).length;
    const parked = failedAll.filter(j => j.attempts >= maxAttempts).length;
    return { pending, inProgress, done, failed, parked };
  }

  async rearmJobs(projectId: bigint): Promise<number> {
    const result = await this.db
      .update(schema.jobs)
      .set({ status: 'pending', attempts: 0, lastError: null, nextAttemptAt: null, updatedAt: new Date() })
      .where(and(eq(schema.jobs.projectId, projectId), ne(schema.jobs.status, 'done')))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    return result.length;
  }

  pendingJobs(projectId: bigint, kind?: Job.Kind): Promise<Job.Row[]> {
    const conditions = [eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'pending')];
    if (kind) conditions.push(eq(schema.jobs.kind, kind));
    return this.db.query.jobs.findMany({ where: and(...conditions), orderBy: asc(schema.jobs.createdAt) });
  }

  async corpusStats(projectId: bigint): Promise<CorpusStats> {
    const [chaptersTotal, chaptersExtracted, entitiesTotal, draftsTotal, draftsFinal, volumesTotal] = await Promise.all([
      this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId)),
      this.db.$count(schema.chapters, and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'))),
      this.db.$count(schema.entities, eq(schema.entities.projectId, projectId)),
      this.db.$count(schema.drafts, eq(schema.drafts.projectId, projectId)),
      this.db.$count(schema.drafts, and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.status, 'final'))),
      this.db.$count(schema.volumes, eq(schema.volumes.projectId, projectId)),
    ]);

    return { chaptersTotal, chaptersExtracted, entitiesTotal, draftsTotal, draftsFinal, volumesTotal };
  }
}
