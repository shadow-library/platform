import { and, asc, desc, eq, gte, inArray, isNotNull, or, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { briefContentHash, lockProjectPlan, ownedBy, reconcilePlanState } from '@server/common';
import { APP_NAME, CURATE_PERMISSION } from '@server/constants';
import { type Bible, type Knowledge, type Plan, type PrimaryDatabase, type PrimaryTransaction, type Project, schema } from '@server/database';

import { type Actor, ActorService, projectOwnerColumns } from '@modules/actor';

import { isRegisteredModel } from '../../ai/defaults';
import { DEFAULT_WRITING_INSTRUCTIONS } from '../../ai/prompts/authoring-preamble';
import { resolveWritingInstructions, writingInstructionAdditions } from '../../ai/prompts/writing-instructions';
import { setProjectCover } from '../../illustration/uploaded-cover';
import { AuthoringClaimService } from '../../jobs/authoring-claim.service';
import { clearLedgerBriefLinks } from '../../ledger/ledger-entries';
import { type CostWindow, summarizeByDay, summarizeCost } from './project-cost';
import { ownerDefaultCostTier } from './project-defaults';
import { assertUnderProjectCap } from './project-limits';
import {
  type CloneProjectBody,
  type CostResponse,
  type CreateProjectBody,
  type ListProjectsQuery,
  type ProjectConfig,
  type ProjectStatusResponse,
  type ProjectWordTarget,
  type ResetResponse,
  STORY_FIELDS,
  type UpdateProjectBody,
} from './project.dto';

const BIBLE_SECTIONS: Bible.Section[] = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];

@Injectable()
export class ProjectService {
  private readonly logger = Logger.getLogger(APP_NAME, ProjectService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly actorService: ActorService,
    private readonly storage: StorageService,
    private readonly authClient: AuthClient,
    private readonly context: ContextService,
    private readonly claims: AuthoringClaimService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private actor(): Actor {
    return this.actorService.current();
  }

  /** Mirrors `ProjectOwnershipGuard`'s sharing branch, one PDP check per request, skipped for bots and org-less users. */
  private async listVisibilityFilter(actor: Actor): Promise<SQL> {
    const own = ownedBy(schema.projects, actor);
    if (actor.kind !== 'user' || actor.organisationId === null) return own;

    const principal = this.context.getAuthPrincipal();
    const organisationId = actor.organisationId.toString();
    const isCurator = await this.authClient.check({ action: CURATE_PERMISSION, organisationId, principal }, { highRisk: true });
    if (!isCurator) return own;

    // A constant, not `eq(sharedWithOrg, true)`: a bound parameter defeats a generic plan's ability to prove
    // the partial index's `WHERE shared_with_org` predicate, degrading this branch (and the whole OR) to a seq scan.
    return or(own, and(sql`${schema.projects.sharedWithOrg}`, eq(schema.projects.organisationId, actor.organisationId))) as SQL;
  }

  // Every persisted model override must name a registry model with the matching provider, regardless of
  // contentMode — the raw pick is otherwise dispatched to the platform's OpenRouter credential verbatim.
  private assertConfigModelsAllowed(config?: ProjectConfig): void {
    const models = config?.models;
    if (!models) return;
    for (const ref of Object.values(models)) {
      if (ref && !isRegisteredModel(ref)) throw AppErrorCode.AI_002.create();
    }
  }

  // Field-level min/max bounds are declared on `ProjectWordTarget` itself; only the cross-field
  // relationship (max strictly above min) needs a service-level check.
  private assertWordTargetValid(target?: ProjectWordTarget | null): void {
    if (!target) return;
    if (target.max <= target.min) throw AppErrorCode.PRJ_010.create();
  }

  // The `ProjectResponse.config`/`wordTarget` schemas are non-nullable objects; a fresh project stores
  // `config = null` and both word-target columns null, so both collapse to `undefined` (an omitted
  // field) before they reach the serialiser.
  private present(project: Project.Row): Project.Presented {
    const { wordTargetMin, wordTargetMax, ...rest } = project;
    const instructions = writingInstructionAdditions(project.instructions);
    const wordTarget = wordTargetMin != null && wordTargetMax != null ? { min: wordTargetMin, max: wordTargetMax } : undefined;
    const coverUrl = this.storage.getPublicUrl(project.coverImagePath);
    return { ...rest, config: project.config ?? undefined, instructions, wordTarget, coverUrl };
  }

  /** The project-cap check always reads outside `tx`, so a caller composing this into a larger transaction still counts against committed rows. */
  async create(body: CreateProjectBody, tx?: PrimaryTransaction): Promise<Project.Presented> {
    this.logger.debug('create project', { name: body.name, kind: body.kind, contentMode: body.contentMode });
    this.assertWordTargetValid(body.wordTarget);
    const actor = this.actor();
    await assertUnderProjectCap(this.db, actor);
    const executor = tx ?? this.db;

    const [project] = await executor
      .insert(schema.projects)
      .values({
        ...projectOwnerColumns(actor),
        name: body.name,
        kind: body.kind,
        title: body.title,
        instructions: writingInstructionAdditions(body.instructions),
        contentMode: body.contentMode,
        costTier: body.costTier ?? (await ownerDefaultCostTier(executor, actor)),
        wordTargetMin: body.wordTarget?.min,
        wordTargetMax: body.wordTarget?.max,
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!project) throw AppErrorCode.S001.create();
    // Logged only outside a caller's transaction: inside one, the row isn't committed yet, and the caller logs once it is.
    if (!tx) this.logger.info('project created', { projectId: project.id, name: project.name, kind: project.kind });

    await executor
      .insert(schema.bibleDocuments)
      .values(BIBLE_SECTIONS.map(section => ({ projectId: project.id, section, slug: 'default' })))
      .catch(err => this.databaseService.translateError(err));

    return this.present(project);
  }

  async list(filter: ListProjectsQuery): Promise<OffsetPaginationResult<Project.Presented>> {
    const query = utils.pagination.normalise(filter, {
      mode: 'offset',
      defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' },
    });

    const visibility = await this.listVisibilityFilter(this.actor());
    const conditions = [visibility];
    if (filter.kind) conditions.push(eq(schema.projects.kind, filter.kind));
    const where = and(...conditions);
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

  async getDetail(id: bigint): Promise<Project.PresentedDetail> {
    const row = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, id) });
    if (!row) throw AppErrorCode.PRJ_001.create();
    const { removedDefaultCopy } = resolveWritingInstructions(row.instructions);
    return { ...this.present(row), defaultInstructions: DEFAULT_WRITING_INSTRUCTIONS, defaultCopyRemoved: removedDefaultCopy };
  }

  async getOrThrow(id: bigint): Promise<Project.Presented> {
    const project = await this.get(id);
    if (!project) throw AppErrorCode.PRJ_001.create();
    return project;
  }

  async setCover(id: bigint, image: string, mime: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<Project.Presented> {
    const ref = await this.storage.save(new Uint8Array(Buffer.from(image, 'base64')), { contentType: mime });
    return this.setCoverRef(id, ref);
  }

  /** Points the cover at an object already in storage — the path the illustration subsystem takes, since it saved the bytes itself. */
  async setCoverRef(id: bigint, ref: string): Promise<Project.Presented> {
    // Content-addressed refs are immutable and deduplicated, so the previous cover is left in place
    // (it may still back another project); setting a new cover only repoints this project's ref.
    const result = await setProjectCover(this.db, id, ref);
    if (!result) throw AppErrorCode.PRJ_001.create();
    return this.present(result);
  }

  async clearCover(id: bigint): Promise<Project.Presented> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, id) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const [result] = await this.db.update(schema.projects).set({ coverImagePath: null, updatedAt: new Date() }).where(eq(schema.projects.id, id)).returning();
    if (!result) throw AppErrorCode.PRJ_001.create();
    return this.present(result);
  }

  async update(id: bigint, update: UpdateProjectBody): Promise<Project.Presented> {
    this.assertConfigModelsAllowed(update.config);
    this.assertWordTargetValid(update.wordTarget);
    const set: Record<string, unknown> = { ...update, updatedAt: new Date() };
    if (update.title !== undefined) set.title = update.title.trim() || null;
    if (update.instructions !== undefined) set.instructions = writingInstructionAdditions(update.instructions);
    for (const field of STORY_FIELDS) {
      const value = update[field];
      if (value !== undefined) set[field] = value?.trim() || null;
    }
    // `wordTarget` is wire shape only — the row stores it as two columns, and `null` clears both back
    // to "use the application default".
    if (update.wordTarget !== undefined) {
      set.wordTargetMin = update.wordTarget?.min ?? null;
      set.wordTargetMax = update.wordTarget?.max ?? null;
    }
    delete set.wordTarget;
    // `finalizeReview` has its own writer (the finalize-review settings route), so replacing the config keeps it, atomically with the write.
    if (update.config !== undefined) {
      const kept = sql`CASE WHEN jsonb_exists(coalesce(${schema.projects.config}, '{}'::jsonb), 'finalizeReview') THEN jsonb_build_object('finalizeReview', ${schema.projects.config} -> 'finalizeReview') ELSE '{}'::jsonb END`;
      set.config = sql`${JSON.stringify(update.config ?? {})}::text::jsonb || ${kept}`;
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
    this.assertConfigModelsAllowed(body.config);
    this.assertWordTargetValid(body.wordTarget);
    const actor = this.actor();
    await assertUnderProjectCap(this.db, actor);
    return this.db.transaction(async tx => {
      const source = await tx.query.projects.findFirst({ where: eq(schema.projects.id, id) });
      if (!source) throw AppErrorCode.PRJ_001.create();

      if (body.resetDerived === false) {
        this.logger.warn(`clone resetDerived=false for project ${id}: full child-table copy is not yet implemented`);
      }

      const [newProject] = await tx
        .insert(schema.projects)
        .values({
          ...projectOwnerColumns(actor),
          name: body.name,
          kind: source.kind,
          title: source.title,
          instructions: writingInstructionAdditions(source.instructions),
          contentMode: body.contentMode ?? source.contentMode,
          costTier: source.costTier,
          config: body.config ? { ...body.config, ...(source.config?.finalizeReview ? { finalizeReview: source.config.finalizeReview } : {}) } : (source.config ?? null),
          wordTargetMin: body.wordTarget?.min ?? source.wordTargetMin,
          wordTargetMax: body.wordTarget?.max ?? source.wordTargetMax,
        })
        .returning()
        .catch(err => this.databaseService.translateError(err));

      if (!newProject) throw AppErrorCode.S001.create();

      if (body.resetDerived !== false) {
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
      }

      return this.present(newProject);
    });
  }

  async delete(id: bigint): Promise<void> {
    this.logger.info('deleting project (cascades to all child tables)', { projectId: id });
    // The claim goes first because its job reference is ON DELETE RESTRICT; the row lock keeps a concurrent acquire from recreating it.
    const result = await this.db.transaction(async tx => {
      await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, id)).for('update');
      await tx.delete(schema.authoringClaims).where(eq(schema.authoringClaims.projectId, id));
      return tx.delete(schema.projects).where(eq(schema.projects.id, id)).returning();
    });
    if (result.length === 0) throw AppErrorCode.PRJ_001.create();
  }

  async reset(id: bigint, stage: string): Promise<ResetResponse> {
    this.logger.info('resetting project stage', { projectId: id, stage });
    const tablesCleared: string[] = [];

    if (stage === 'knowledge' || stage === 'all') {
      await this.db.delete(schema.entities).where(eq(schema.entities.projectId, id));
      tablesCleared.push('entities');
      await this.db.delete(schema.plotThreads).where(eq(schema.plotThreads.projectId, id));
      tablesCleared.push('plotThreads');
      await this.db.delete(schema.worldFacts).where(eq(schema.worldFacts.projectId, id));
      tablesCleared.push('worldFacts');
      await this.db.delete(schema.mysteries).where(eq(schema.mysteries.projectId, id));
      tablesCleared.push('mysteries');
    }

    if (stage === 'plan' || stage === 'all') {
      const unassigned = await this.db.transaction(async tx => {
        await lockProjectPlan(tx, id);
        const planned = await tx
          .select()
          .from(schema.briefs)
          .where(and(eq(schema.briefs.projectId, id), isNotNull(schema.briefs.volumeKey)));
        for (const brief of planned) {
          const contentHash = briefContentHash({ ...brief, volumeKey: null });
          await tx
            .update(schema.briefs)
            .set({ volumeKey: null, revision: brief.revision + 1, contentHash, updatedAt: new Date() })
            .where(eq(schema.briefs.id, brief.id));
        }
        await tx.delete(schema.volumes).where(eq(schema.volumes.projectId, id));
        await reconcilePlanState(tx, id);
        return planned.length;
      });
      tablesCleared.push('volumes');
      if (unassigned > 0) tablesCleared.push('briefs.volumeKey');
    }

    if (stage === 'generate' || stage === 'all') {
      await this.releaseIdleAuthoringClaim(id);
      await this.db.delete(schema.drafts).where(eq(schema.drafts.projectId, id));
      tablesCleared.push('drafts');
      await this.db.transaction(async tx => {
        await lockProjectPlan(tx, id);
        await tx.delete(schema.briefs).where(eq(schema.briefs.projectId, id));
        await reconcilePlanState(tx, id);
      });
      tablesCleared.push('briefs');
      await clearLedgerBriefLinks(this.db, id);
      await this.db.delete(schema.continuityProposals).where(eq(schema.continuityProposals.projectId, id));
      tablesCleared.push('continuityProposals');
      await this.db.delete(schema.chapterReviews).where(eq(schema.chapterReviews.projectId, id));
      tablesCleared.push('chapterReviews');
      await this.db.delete(schema.jobs).where(and(eq(schema.jobs.projectId, id), inArray(schema.jobs.kind, ['generate', 'finalize', 'backfill', 'review'])));
      tablesCleared.push('jobs(generate/finalize/backfill/review)');
    }

    this.logger.info('project stage reset complete', { projectId: id, stage, tablesCleared });
    return { stage, tablesCleared };
  }

  /** The reset deletes the jobs a claim may name, so it refuses while the claim's job is active or a job-less claim (finalize, insert) is live. */
  private async releaseIdleAuthoringClaim(projectId: bigint): Promise<void> {
    await this.db.transaction(async tx => {
      const [claim] = await tx.select().from(schema.authoringClaims).where(eq(schema.authoringClaims.projectId, projectId)).for('update');
      if (!claim) return;
      const job = claim.jobId ? await tx.query.jobs.findFirst({ where: eq(schema.jobs.id, claim.jobId), columns: { status: true } }) : undefined;
      const busy = job ? job.status === 'pending' || job.status === 'in_progress' : (await this.claims.holder(projectId, tx))?.live === true;
      if (busy) throw AppErrorCode.PRJ_011.create();
      await tx.delete(schema.authoringClaims).where(eq(schema.authoringClaims.projectId, projectId));
      this.logger.info('reset released a stale authoring claim', { projectId, jobId: claim.jobId, kind: claim.kind });
    });
  }

  async status(id: bigint): Promise<ProjectStatusResponse> {
    const project = await this.get(id);
    if (!project) throw AppErrorCode.PRJ_001.create();

    // Single-row aggregate queries with conditional counts, rather than concurrent `$count` calls: fewer
    // connections under load (drizzle's `$count` intermittently crashed on `res[0].count` when the pool was
    // contended by in-flight generation writes), and each `?? 0` is crash-proof.
    const [chapterRow, draftRow, volumeRow] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          final: sql<number>`(count(*) filter (where ${schema.chapters.status} = 'done'))::int`,
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
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.volumes)
        .where(eq(schema.volumes.projectId, id)),
    ]);

    const chaptersTotal = chapterRow[0]?.total ?? 0;
    const chaptersFinal = chapterRow[0]?.final ?? 0;
    const draftsTotal = draftRow[0]?.total ?? 0;
    const draftsFinal = draftRow[0]?.final ?? 0;
    const volumesTotal = volumeRow[0]?.total ?? 0;

    return { kind: project.kind, chaptersTotal, chaptersFinal, draftsTotal, draftsFinal, volumesTotal };
  }

  async cost(projectId: bigint): Promise<CostResponse> {
    const calls = schema.modelCalls;
    const window = sql<CostWindow>`case when ${calls.createdAt} >= now() - interval '7 days' then 'last7Days' when ${calls.createdAt} >= now() - interval '30 days' then 'last30Days' else 'older' end`;
    const [rows, dayRows] = await Promise.all([
      this.db
        .select({
          role: calls.role,
          model: calls.model,
          window,
          status: calls.status,
          costSource: calls.costSource,
          tier: calls.tier,
          contentMode: calls.contentMode,
          calls: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${calls.inputTokens}), 0)::bigint`.mapWith(Number),
          outputTokens: sql<number>`coalesce(sum(${calls.outputTokens}), 0)::bigint`.mapWith(Number),
          recordedCostUsd: sql<number>`coalesce(sum(${calls.costUsd}), 0)`.mapWith(Number),
          unpricedInputTokens: sql<number>`coalesce(sum(${calls.inputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
          unpricedOutputTokens: sql<number>`coalesce(sum(${calls.outputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
        })
        .from(calls)
        .where(eq(calls.projectId, projectId))
        .groupBy(calls.role, calls.model, window, calls.status, calls.costSource, calls.tier, calls.contentMode),
      this.db
        .select({
          day: sql<string>`to_char(${calls.createdAt}, 'YYYY-MM-DD')`,
          model: calls.model,
          status: calls.status,
          costSource: calls.costSource,
          calls: sql<number>`count(*)::int`,
          recordedCostUsd: sql<number>`coalesce(sum(${calls.costUsd}), 0)`.mapWith(Number),
          unpricedInputTokens: sql<number>`coalesce(sum(${calls.inputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
          unpricedOutputTokens: sql<number>`coalesce(sum(${calls.outputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
        })
        .from(calls)
        .where(and(eq(calls.projectId, projectId), gte(calls.createdAt, sql`date_trunc('day', now() - interval '30 days')`)))
        .groupBy(sql`1`, calls.model, calls.status, calls.costSource),
    ]);
    return { ...summarizeCost(rows), byDay: summarizeByDay(dayRows) };
  }
}
