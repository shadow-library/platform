/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger, ValidationError } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, eq, inArray, notInArray } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { arcContentHash, briefContentHash, computeBibleDocHash, renderBriefBody, volumeContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { type CollectionResult, type ImportPlanBody, type ImportPlanResponse, type PlanBundle } from './plan-import.dto';
import { validatePlanBundle } from './plan-import.validator';
import { approveVolumePlan } from '../bible/volume/volume.approve';

/**
 * Defining types
 */

type CollectionName = 'bible' | 'entities' | 'volumes' | 'arcs' | 'briefs';

/**
 * Declaring the constants
 */

const BUNDLE_FORMAT = 'novel-forge-plan';
const BUNDLE_VERSION = 1;

function emptyResult(): CollectionResult {
  return { created: 0, updated: 0, unchanged: 0, pruned: 0 };
}

@Injectable()
export class PlanImportService {
  private readonly logger = Logger.getLogger(APP_NAME, PlanImportService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async import(projectId: bigint, body: ImportPlanBody): Promise<ImportPlanResponse> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw new ServerError(AppErrorCode.PRJ_001);
    if (project.kind !== 'new_novel') throw new ServerError(AppErrorCode.PRJ_003);

    const bundle = body.bundle;
    if (bundle.format !== BUNDLE_FORMAT || bundle.version !== BUNDLE_VERSION) throw new ServerError(AppErrorCode.IMP_002);

    const existingEntities = await this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), columns: { entityKey: true } });
    const validation = validatePlanBundle(bundle, new Set(existingEntities.map(e => e.entityKey)));
    if (validation.issues.length > 0) {
      const error = new ValidationError();
      for (const issue of validation.issues) error.addFieldError(issue.field, issue.msg);
      throw error;
    }

    await this.assertGuards(projectId, bundle, body.overwrite === true);

    const overwrite = body.overwrite === true;
    const response = await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;
      const results = {
        bible: await this.importBible(tx, projectId, bundle, overwrite),
        entities: await this.importEntities(tx, projectId, bundle, overwrite),
        volumes: await this.importVolumes(tx, projectId, bundle, overwrite),
        arcs: await this.importArcs(tx, projectId, bundle, overwrite),
        briefs: await this.importBriefs(tx, projectId, bundle, overwrite),
      };

      if (body.approve !== true) return { results, warnings: validation.warnings };

      const { volumesApproved } = await approveVolumePlan(tx, projectId);
      let arcsApproved = 0;
      if (validation.arcVolumeKeys.length > 0) {
        const approved = await tx
          .update(schema.arcs)
          .set({ status: 'approved', staleReason: null, updatedAt: new Date() })
          .where(and(eq(schema.arcs.projectId, projectId), inArray(schema.arcs.volumeKey, validation.arcVolumeKeys)))
          .returning({ id: schema.arcs.id });
        arcsApproved = approved.length;
      }
      return { results, approval: { volumesApproved, arcsApproved }, warnings: validation.warnings };
    });

    this.logger.info('plan bundle imported', {
      projectId,
      overwrite,
      approved: body.approve === true,
      counts: Object.fromEntries(Object.entries(response.results).map(([k, v]) => [k, v.created + v.updated])),
    });
    return response;
  }

  /**
   * Default-reject on non-empty collections: importing over data you refined in the app must be an
   * explicit decision. Overwrite itself stops once prose exists — pruning plan rows under written
   * chapters would orphan continuity.
   */
  private async assertGuards(projectId: bigint, bundle: PlanBundle, overwrite: boolean): Promise<void> {
    if (overwrite) {
      const [draftCount, chapterCount] = await Promise.all([
        this.db.$count(schema.drafts, eq(schema.drafts.projectId, projectId)),
        this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId)),
      ]);
      if (draftCount > 0 || chapterCount > 0) throw new ServerError(AppErrorCode.IMP_003);
      return;
    }

    const collections: { name: CollectionName; carried: number; count: () => Promise<number> }[] = [
      { name: 'bible', carried: bundle.bible?.length ?? 0, count: () => this.db.$count(schema.bibleDocuments, eq(schema.bibleDocuments.projectId, projectId)) },
      { name: 'entities', carried: bundle.entities?.length ?? 0, count: () => this.db.$count(schema.entities, eq(schema.entities.projectId, projectId)) },
      { name: 'volumes', carried: bundle.volumes?.length ?? 0, count: () => this.db.$count(schema.volumes, eq(schema.volumes.projectId, projectId)) },
      { name: 'arcs', carried: bundle.arcs?.length ?? 0, count: () => this.db.$count(schema.arcs, eq(schema.arcs.projectId, projectId)) },
      { name: 'briefs', carried: bundle.briefs?.length ?? 0, count: () => this.db.$count(schema.briefs, eq(schema.briefs.projectId, projectId)) },
    ];
    for (const collection of collections) {
      if (collection.carried === 0) continue;
      if ((await collection.count()) > 0) throw new ServerError(AppErrorCode.IMP_001);
    }
  }

  private async importBible(tx: PrimaryDatabase, projectId: bigint, bundle: PlanBundle, overwrite: boolean): Promise<CollectionResult> {
    const docs = bundle.bible ?? [];
    const result = emptyResult();
    if (docs.length === 0) return result;

    const existing = await tx.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId) });
    const existingByKey = new Map(existing.map(d => [`${d.section}/${d.slug}`, d]));
    let anyChanged = false;

    for (const doc of docs) {
      const row = existingByKey.get(`${doc.section}/${doc.slug}`);
      const contentHash = computeBibleDocHash(doc.frontmatter ?? null, doc.body);
      if (row && row.contentHash === contentHash) {
        result.unchanged += 1;
        continue;
      }
      anyChanged = true;
      if (row) {
        await tx
          .update(schema.bibleDocuments)
          .set({ frontmatter: doc.frontmatter ?? null, body: doc.body, contentHash, revision: row.revision + 1, updatedAt: new Date() })
          .where(eq(schema.bibleDocuments.id, row.id));
        result.updated += 1;
      } else {
        await tx.insert(schema.bibleDocuments).values({ projectId, section: doc.section, slug: doc.slug, frontmatter: doc.frontmatter ?? null, body: doc.body, contentHash });
        result.created += 1;
      }
    }

    if (overwrite) {
      const keep = docs.map(d => `${d.section}/${d.slug}`);
      const prune = existing.filter(d => !keep.includes(`${d.section}/${d.slug}`));
      if (prune.length > 0) {
        await tx.delete(schema.bibleDocuments).where(
          inArray(
            schema.bibleDocuments.id,
            prune.map(d => d.id),
          ),
        );
        result.pruned = prune.length;
        anyChanged = true;
      }
    }

    // Same invariant as BibleDocumentService.upsert: canon that changed must flag every finalized
    // chapter for re-validation (vacuous pre-generation, correct under overwrite).
    if (anyChanged) await tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, projectId));
    return result;
  }

  private async importEntities(tx: PrimaryDatabase, projectId: bigint, bundle: PlanBundle, overwrite: boolean): Promise<CollectionResult> {
    const items = bundle.entities ?? [];
    const result = emptyResult();
    if (items.length === 0) return result;

    const existing = await tx.query.entities.findMany({ where: eq(schema.entities.projectId, projectId) });
    const existingByKey = new Map(existing.map(e => [e.entityKey, e]));

    for (const item of items) {
      const row = existingByKey.get(item.entityKey);
      const values = {
        type: item.type,
        name: item.name,
        significance: item.significance ?? null,
        status: item.status ?? null,
        motivation: item.motivation ?? null,
        notes: item.notes ?? null,
        body: item.body ?? null,
      };
      // Entities carry no content hash; field-level comparison keeps re-imports idempotent.
      const unchanged = row && Object.entries(values).every(([key, value]) => (row[key as keyof typeof values] ?? null) === value);
      if (unchanged) {
        result.unchanged += 1;
        continue;
      }
      if (row) {
        await tx
          .update(schema.entities)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(schema.entities.id, row.id));
        result.updated += 1;
      } else {
        await tx.insert(schema.entities).values({ projectId, entityKey: item.entityKey, origin: 'seeded', ...values });
        result.created += 1;
      }
    }

    if (overwrite) {
      const keep = items.map(i => i.entityKey);
      const pruned = await tx
        .delete(schema.entities)
        .where(and(eq(schema.entities.projectId, projectId), notInArray(schema.entities.entityKey, keep)))
        .returning({ id: schema.entities.id });
      result.pruned = pruned.length;
    }
    return result;
  }

  private async importVolumes(tx: PrimaryDatabase, projectId: bigint, bundle: PlanBundle, overwrite: boolean): Promise<CollectionResult> {
    const items = bundle.volumes ?? [];
    const result = emptyResult();
    if (items.length === 0) return result;

    const existing = await tx.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId) });
    const existingByKey = new Map(existing.map(v => [v.volumeKey, v]));

    for (const item of items) {
      const row = existingByKey.get(item.volumeKey);
      const values = {
        ordinal: item.ordinal,
        title: item.title,
        objective: item.objective,
        conflict: item.conflict,
        payoff: item.payoff,
        targetChapterCount: item.targetChapterCount,
        cast: item.cast ?? null,
        body: item.body ?? null,
      };
      // Ranges never come from the bundle — hash with the stored ones so an identical re-import
      // of an already-approved plan counts unchanged instead of re-versioning every volume.
      const contentHash = volumeContentHash({ volumeKey: item.volumeKey, ...values, startChapter: row?.startChapter ?? null, endChapter: row?.endChapter ?? null });
      if (row && row.contentHash === contentHash) {
        result.unchanged += 1;
        continue;
      }
      if (row) {
        // Changed content invalidates the previous human approval — back to draft until re-approved.
        await tx
          .update(schema.volumes)
          .set({ ...values, status: 'draft', contentHash, revision: row.revision + 1, staleReason: null, updatedAt: new Date() })
          .where(eq(schema.volumes.id, row.id));
        result.updated += 1;
      } else {
        await tx.insert(schema.volumes).values({ projectId, volumeKey: item.volumeKey, ...values, contentHash });
        result.created += 1;
      }
    }

    if (overwrite) {
      const keep = items.map(i => i.volumeKey);
      const pruned = await tx
        .delete(schema.volumes)
        .where(and(eq(schema.volumes.projectId, projectId), notInArray(schema.volumes.volumeKey, keep)))
        .returning({ id: schema.volumes.id });
      result.pruned = pruned.length;
    }
    return result;
  }

  private async importArcs(tx: PrimaryDatabase, projectId: bigint, bundle: PlanBundle, overwrite: boolean): Promise<CollectionResult> {
    const items = bundle.arcs ?? [];
    const result = emptyResult();
    if (items.length === 0) return result;

    const existing = await tx.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId) });
    const existingByKey = new Map(existing.map(a => [a.arcKey, a]));

    for (const item of items) {
      const row = existingByKey.get(item.arcKey);
      const values = {
        volumeKey: item.volumeKey,
        ordinal: item.ordinal,
        title: item.title,
        objective: item.objective,
        escalation: item.escalation,
        payoff: item.payoff,
        hook: item.hook,
        chapterStart: item.chapterStart,
        chapterEnd: item.chapterEnd,
        cast: item.cast ?? null,
        body: item.body ?? null,
      };
      const contentHash = arcContentHash({ arcKey: item.arcKey, ...values });
      if (row && row.contentHash === contentHash) {
        result.unchanged += 1;
        continue;
      }
      if (row) {
        await tx
          .update(schema.arcs)
          .set({ ...values, status: 'draft', contentHash, revision: row.revision + 1, staleReason: null, updatedAt: new Date() })
          .where(eq(schema.arcs.id, row.id));
        result.updated += 1;
      } else {
        await tx.insert(schema.arcs).values({ projectId, arcKey: item.arcKey, ...values, contentHash });
        result.created += 1;
      }
    }

    if (overwrite) {
      const keep = items.map(i => i.arcKey);
      const pruned = await tx
        .delete(schema.arcs)
        .where(and(eq(schema.arcs.projectId, projectId), notInArray(schema.arcs.arcKey, keep)))
        .returning({ id: schema.arcs.id });
      result.pruned = pruned.length;
    }
    return result;
  }

  private async importBriefs(tx: PrimaryDatabase, projectId: bigint, bundle: PlanBundle, overwrite: boolean): Promise<CollectionResult> {
    const items = bundle.briefs ?? [];
    const result = emptyResult();
    if (items.length === 0) return result;

    const existing = await tx.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId) });
    const existingByChapter = new Map(existing.map(b => [b.chapter, b]));

    for (const item of items) {
      const row = existingByChapter.get(item.chapter);
      const values = {
        volumeKey: item.volumeKey,
        arcKey: item.arcKey ?? null,
        title: item.title,
        body: renderBriefBody(item),
        contextRefs: (item.requiredContext ?? []) as never,
        endingContract: { ...item.endingContract } as Record<string, unknown>,
      };
      const contentHash = briefContentHash({ chapter: item.chapter, ...values });
      if (row && row.contentHash === contentHash) {
        result.unchanged += 1;
        continue;
      }
      if (row) {
        await tx
          .update(schema.briefs)
          .set({ ...values, contentHash, revision: row.revision + 1, staleReason: null, updatedAt: new Date() })
          .where(eq(schema.briefs.id, row.id));
        result.updated += 1;
      } else {
        await tx.insert(schema.briefs).values({ projectId, chapter: item.chapter, ...values, contentHash });
        result.created += 1;
      }
    }

    if (overwrite) {
      const keep = items.map(i => i.chapter);
      const pruned = await tx
        .delete(schema.briefs)
        .where(and(eq(schema.briefs.projectId, projectId), notInArray(schema.briefs.chapter, keep)))
        .returning({ id: schema.briefs.id });
      result.pruned = pruned.length;
    }
    return result;
  }
}
