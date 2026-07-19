/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Bible, type Chapter, type Knowledge, type Plan, type PrimaryDatabase, type Project, schema } from '@server/database';

import { DEFAULT_WRITING_INSTRUCTIONS } from '../../ai/prompts/authoring-preamble';
import { IMAGE_STORAGE, type ImageStorageProvider } from '../../storage/image-storage.interface';
import {
  type CloneProjectBody,
  type CostResponse,
  type CreateProjectBody,
  type ListProjectsQuery,
  type ProjectStatusResponse,
  type ResetResponse,
  type UpdateProjectBody,
} from './project.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const BIBLE_SECTIONS: Bible.Section[] = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];

@Injectable()
export class ProjectService {
  private readonly logger = Logger.getLogger(APP_NAME, ProjectService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorageProvider,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // The `ProjectResponse.config` schema is a non-nullable object; a fresh project stores `config = null`,
  // so map that to `undefined` (an omitted field) before it reaches the serialiser. `instructions` is
  // surfaced as its effective value (stored override or the default) so the settings form always shows
  // the writing instructions the AI will actually use.
  private present(project: Project.Row): Project.Presented {
    const instructions = project.instructions?.trim() || DEFAULT_WRITING_INSTRUCTIONS;
    return { ...project, config: project.config ?? undefined, instructions };
  }

  async create(body: CreateProjectBody): Promise<Project.Presented> {
    if (body.kind === 'source' && !body.url) throw AppErrorCode.SRC_001.create();
    this.logger.debug('create project', { name: body.name, kind: body.kind, url: body.url, webnovelId: body.webnovelId, contentMode: body.contentMode });

    const [project] = await this.db
      .insert(schema.projects)
      .values({
        name: body.name,
        kind: body.kind,
        sourceUrl: body.url,
        title: body.title,
        webnovelId: body.webnovelId,
        // Blank instructions stay null so the column means "use the default"; `present` fills it in.
        instructions: body.instructions?.trim() || null,
        contentMode: body.contentMode,
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!project) throw AppErrorCode.S001.create();
    this.logger.info('project created', { projectId: project.id, name: project.name, kind: project.kind });

    if (body.kind === 'new_novel') {
      await this.db
        .insert(schema.bibleDocuments)
        .values(BIBLE_SECTIONS.map(section => ({ projectId: project.id, section, slug: 'default' })))
        .catch(err => this.databaseService.translateError(err));
    }

    return this.present(project);
  }

  async list(filter: ListProjectsQuery): Promise<OffsetPaginationResult<Project.Presented>> {
    const query = utils.pagination.normalise(filter, {
      mode: 'offset',
      defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' },
    });

    const where = filter.kind ? eq(schema.projects.kind, filter.kind) : undefined;
    const column = query.sortBy === 'createdAt' ? schema.projects.createdAt : schema.projects.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, items] = await Promise.all([
      this.db.$count(schema.projects, where),
      this.db.query.projects.findMany({ where, limit: query.limit, offset: query.offset, orderBy: order }),
    ]);

    return utils.pagination.createResult(
      query,
      items.map(item => this.present(item)),
      total,
    );
  }

  get(id: bigint): Promise<Project.Presented | null> {
    return this.db.query.projects.findFirst({ where: eq(schema.projects.id, id) }).then(r => (r ? this.present(r) : null));
  }

  async getOrThrow(id: bigint): Promise<Project.Presented> {
    const project = await this.get(id);
    if (!project) throw AppErrorCode.PRJ_001.create();
    return project;
  }

  async setCover(id: bigint, image: string, mime: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<Project.Presented> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, id) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    // Drop the previous cover first so a different extension (png → jpg) never leaves an orphan behind.
    if (project.coverImagePath) await this.imageStorage.delete(project.coverImagePath);
    const ref = await this.imageStorage.save(id, 'cover', new Uint8Array(Buffer.from(image, 'base64')), mime);

    const [result] = await this.db.update(schema.projects).set({ coverImagePath: ref, updatedAt: new Date() }).where(eq(schema.projects.id, id)).returning();
    if (!result) throw AppErrorCode.PRJ_001.create();
    return this.present(result);
  }

  async clearCover(id: bigint): Promise<Project.Presented> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, id) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.coverImagePath) await this.imageStorage.delete(project.coverImagePath);

    const [result] = await this.db.update(schema.projects).set({ coverImagePath: null, updatedAt: new Date() }).where(eq(schema.projects.id, id)).returning();
    if (!result) throw AppErrorCode.PRJ_001.create();
    return this.present(result);
  }

  async update(id: bigint, update: UpdateProjectBody): Promise<Project.Presented> {
    const set: Record<string, unknown> = { ...update, updatedAt: new Date() };
    // Normalise the writing instructions: blank — or the default itself — collapses back to null so the
    // column keeps meaning "use the default" and follows future changes to DEFAULT_WRITING_INSTRUCTIONS.
    if (update.instructions !== undefined) {
      const trimmed = update.instructions?.trim() ?? '';
      set.instructions = trimmed && trimmed !== DEFAULT_WRITING_INSTRUCTIONS ? trimmed : null;
    }

    const [result] = await this.db
      .update(schema.projects)
      .set(set)
      .where(eq(schema.projects.id, id))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) throw AppErrorCode.PRJ_001.create();
    return this.present(result);
  }

  async clone(id: bigint, body: CloneProjectBody): Promise<Project.Presented> {
    return this.db.transaction(async tx => {
      const source = await tx.query.projects.findFirst({ where: eq(schema.projects.id, id) });
      if (!source) throw AppErrorCode.PRJ_001.create();

      if (body.resetDerived === false) {
        this.logger.warn(`clone resetDerived=false for project ${id}: full child-table copy is not yet implemented`);
      }

      const [newProject] = await tx
        .insert(schema.projects)
        .values({
          name: body.name,
          kind: source.kind,
          title: source.title,
          contentMode: body.contentMode ?? source.contentMode,
          config: body.config ?? source.config ?? null,
          sourceUrl: source.sourceUrl,
          sourceAdapter: source.sourceAdapter,
          sourceNovelId: source.sourceNovelId,
          skeletonCharacterArcs: source.skeletonCharacterArcs,
          skeletonPowerCurve: source.skeletonPowerCurve,
        })
        .returning()
        .catch(err => this.databaseService.translateError(err));

      if (!newProject) throw AppErrorCode.S001.create();

      if (body.resetDerived !== false) {
        if (source.kind === 'new_novel') {
          const [bibleDocs, entities, volumes] = await Promise.all([
            tx.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, id) }),
            tx.query.entities.findMany({ where: eq(schema.entities.projectId, id) }),
            tx.query.volumes.findMany({ where: eq(schema.volumes.projectId, id) }),
          ]);

          if (bibleDocs.length > 0) {
            const bibleRows: Omit<Bible.Document, 'id' | 'projectId'>[] = bibleDocs.map(d => utils.object.omitKeys(d, ['id', 'projectId']));
            await tx
              .insert(schema.bibleDocuments)
              .values(bibleRows.map(r => ({ ...r, projectId: newProject.id })))
              .catch(err => this.databaseService.translateError(err));
          }

          if (entities.length > 0) {
            const entityRows: Omit<Knowledge.Entity, 'id' | 'projectId'>[] = entities.map(e => utils.object.omitKeys(e, ['id', 'projectId']));
            await tx
              .insert(schema.entities)
              .values(entityRows.map(r => ({ ...r, projectId: newProject.id })))
              .catch(err => this.databaseService.translateError(err));
          }

          if (volumes.length > 0) {
            const volumeRows: Omit<Plan.Volume, 'id' | 'projectId'>[] = volumes.map(v => utils.object.omitKeys(v, ['id', 'projectId']));
            await tx
              .insert(schema.volumes)
              .values(volumeRows.map(r => ({ ...r, projectId: newProject.id })))
              .catch(err => this.databaseService.translateError(err));
          }
        } else {
          const chapters = await tx.query.chapters.findMany({ where: eq(schema.chapters.projectId, id) });
          if (chapters.length > 0) {
            const chapterRows: Omit<Chapter.Row, 'id' | 'projectId'>[] = chapters.map(c => utils.object.omitKeys(c, ['id', 'projectId']));
            await tx
              .insert(schema.chapters)
              .values(chapterRows.map(r => ({ ...r, projectId: newProject.id })))
              .catch(err => this.databaseService.translateError(err));
          }
          await tx
            .update(schema.projects)
            .set({ scrapeNextUrl: source.scrapeNextUrl, scrapeNextNumber: source.scrapeNextNumber, scrapeComplete: source.scrapeComplete, updatedAt: new Date() })
            .where(eq(schema.projects.id, newProject.id));
        }
      }

      return this.present(newProject);
    });
  }

  async delete(id: bigint): Promise<void> {
    this.logger.info('deleting project (cascades to all child tables)', { projectId: id });
    const result = await this.db.delete(schema.projects).where(eq(schema.projects.id, id)).returning();
    if (result.length === 0) throw AppErrorCode.PRJ_001.create();
  }

  async reset(id: bigint, stage: string): Promise<ResetResponse> {
    this.logger.info('resetting project stage', { projectId: id, stage });
    const tablesCleared: string[] = [];

    if (stage === 'extract' || stage === 'all') {
      await this.db.delete(schema.extractionRuns).where(eq(schema.extractionRuns.projectId, id));
      tablesCleared.push('extractionRuns');
      await this.db.delete(schema.entities).where(eq(schema.entities.projectId, id));
      tablesCleared.push('entities');
      await this.db.delete(schema.beats).where(eq(schema.beats.projectId, id));
      tablesCleared.push('beats');
      await this.db.delete(schema.plotThreads).where(eq(schema.plotThreads.projectId, id));
      tablesCleared.push('plotThreads');
      await this.db.delete(schema.worldFacts).where(eq(schema.worldFacts.projectId, id));
      tablesCleared.push('worldFacts');
      await this.db.delete(schema.mysteries).where(eq(schema.mysteries.projectId, id));
      tablesCleared.push('mysteries');
      await this.db.delete(schema.jobs).where(and(eq(schema.jobs.projectId, id), inArray(schema.jobs.kind, ['extract', 'resume'])));
      tablesCleared.push('jobs(extract/resume)');
    }

    if (stage === 'plan' || stage === 'all') {
      await this.db.delete(schema.volumes).where(eq(schema.volumes.projectId, id));
      if (!tablesCleared.includes('volumes')) tablesCleared.push('volumes');
      await this.db.delete(schema.jobs).where(and(eq(schema.jobs.projectId, id), notInArray(schema.jobs.kind, ['extract', 'ingest'])));
      if (!tablesCleared.some(t => t.startsWith('jobs'))) tablesCleared.push('jobs(plan)');
    }

    if (stage === 'generate' || stage === 'all') {
      await this.db.delete(schema.drafts).where(eq(schema.drafts.projectId, id));
      tablesCleared.push('drafts');
      await this.db.delete(schema.briefs).where(eq(schema.briefs.projectId, id));
      tablesCleared.push('briefs');
      await this.db.delete(schema.continuityProposals).where(eq(schema.continuityProposals.projectId, id));
      tablesCleared.push('continuityProposals');
      await this.db.delete(schema.jobs).where(and(eq(schema.jobs.projectId, id), inArray(schema.jobs.kind, ['generate', 'finalize', 'backfill'])));
      if (!tablesCleared.some(t => t.startsWith('jobs'))) tablesCleared.push('jobs(generate/finalize/backfill)');
    }

    this.logger.info('project stage reset complete', { projectId: id, stage, tablesCleared });
    return { stage, tablesCleared };
  }

  async status(id: bigint): Promise<ProjectStatusResponse> {
    const project = await this.get(id);
    if (!project) throw AppErrorCode.PRJ_001.create();

    // Three single-row aggregate queries with conditional counts, rather than six concurrent `$count`
    // calls: fewer connections under load (drizzle's `$count` intermittently crashed on `res[0].count`
    // when the pool was contended by in-flight generation writes), and each `?? 0` is crash-proof.
    const [chapterRow, draftRow, volumeRow] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          extracted: sql<number>`(count(*) filter (where ${schema.chapters.status} = 'done'))::int`,
        })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, id)),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          final: sql<number>`(count(*) filter (where ${schema.drafts.status} = 'final'))::int`,
        })
        .from(schema.drafts)
        .where(eq(schema.drafts.projectId, id)),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          unapproved: sql<number>`(count(*) filter (where ${schema.volumes.status} <> 'approved'))::int`,
        })
        .from(schema.volumes)
        .where(eq(schema.volumes.projectId, id)),
    ]);

    const chaptersTotal = chapterRow[0]?.total ?? 0;
    const chaptersExtracted = chapterRow[0]?.extracted ?? 0;
    const draftsTotal = draftRow[0]?.total ?? 0;
    const draftsFinal = draftRow[0]?.final ?? 0;
    const volumesTotal = volumeRow[0]?.total ?? 0;
    const unapprovedVolumes = volumeRow[0]?.unapproved ?? 0;

    const planApproved = volumesTotal > 0 && unapprovedVolumes === 0;

    return { kind: project.kind, chaptersTotal, chaptersExtracted, draftsTotal, draftsFinal, planApproved, volumesTotal };
  }

  cost(projectId: bigint): Promise<CostResponse> {
    this.logger.debug(`Cost estimate requested for project ${String(projectId)}`);
    return Promise.resolve({ estimate: null, message: 'AI module not yet initialized' });
  }
}
