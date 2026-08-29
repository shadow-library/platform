import { and, asc, eq, isNotNull, max } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type ImportedNovelMetaData, type PrimaryDatabase, type Project, schema } from '@server/database';

import { landFinalChapters } from '../novel-import/land-chapters';
import { ProjectService } from '../project';
import { type IngestChapterBody, type IngestManifestResponse, type IngestNovelBody, type IngestNovelResponse } from './curated-ingest.dto';
import { type IngestAction, IngestAuditService, type IngestOutcome } from './ingest-audit.service';

export interface IngestChapterResult {
  projectId: bigint;
  landed: boolean;
}

@Injectable()
export class CuratedIngestService {
  private readonly logger = Logger.getLogger(APP_NAME, CuratedIngestService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly context: ContextService,
    private readonly projectService: ProjectService,
    private readonly audit: IngestAuditService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Create-or-return, never update: a source reference that already names one of the caller's projects is
   * answered with its id and nothing else happens, because the forge owns the metadata from the moment the
   * novel lands and a later scrape must not walk a curator's edits back.
   */
  async upsertNovel(sourceRef: string, body: IngestNovelBody): Promise<IngestNovelResponse> {
    const existing = await this.resolveOwned(sourceRef);
    if (existing) {
      await this.record('novel.upsert', sourceRef, 'exists', existing.id);
      return { projectId: existing.id, created: false };
    }

    const created = await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;
      const [project] = await tx
        .insert(schema.projects)
        .values({
          ownerId: this.owner(),
          name: body.title,
          kind: 'new_novel' as const,
          title: body.title,
          brief: body.synopsis,
          themes: body.tags ?? null,
          // Trimmed here, not at the publish that adopts it: the two ledgers must hold the same text, and a whitespace-only name is no name.
          originalAuthor: body.originalAuthor?.trim() || null,
          importedMeta: this.importedMeta(body),
          sourceRef,
        })
        .onConflictDoNothing({ target: schema.projects.sourceRef })
        .returning();
      if (!project) return null;

      // Mirrors ProjectService.create and NovelImportService.import: a `new_novel` project is born with
      // contentless `<section>/default` placeholder bible docs.
      await tx.insert(schema.bibleDocuments).values(schema.bibleSection.enumValues.map(section => ({ projectId: project.id, section, slug: 'default' })));
      return project;
    });

    if (created) {
      await this.record('novel.upsert', sourceRef, 'created', created.id);
      return { projectId: created.id, created: true };
    }

    // Lost a race against a concurrent push of the same reference; the winner decides the answer, and a
    // winner belonging to someone else is masked exactly as an absent one.
    const winner = await this.requireOwned(sourceRef, 'novel.upsert');
    await this.record('novel.upsert', sourceRef, 'exists', winner.id);
    return { projectId: winner.id, created: false };
  }

  /**
   * Appends one chapter as a locked human final, keyed on the source's own ordinal. The whole decision runs
   * under a row lock on the project so two pushes cannot both read "absent" and then compute the same next
   * `chapters.number`; the unique indexes stay the backstop for a push arriving from another process.
   *
   * Known limitation: the contiguity rule reads only the highest ingested ordinal, so deleting an ingested
   * interior chapter in the forge leaves that ordinal unrepairable — a re-push of it is refused with ING_002.
   * Deliberate for now: a hole is a curator's decision, and re-opening it needs a repair path, not a retry.
   */
  async pushChapter(sourceRef: string, sourceOrdinal: number, body: IngestChapterBody): Promise<IngestChapterResult> {
    const project = await this.requireOwned(sourceRef, 'chapter.push');

    const landed = await this.db
      .transaction(async rawTx => {
        const tx = rawTx as unknown as PrimaryDatabase;
        await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, project.id)).for('update');

        const existing = await tx.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, project.id), eq(schema.chapters.sourceOrdinal, sourceOrdinal)) });
        if (existing) {
          if (existing.title === body.title && existing.content === body.content) return false;
          throw AppErrorCode.ING_003.create();
        }

        const [bounds] = await tx
          .select({ ordinal: max(schema.chapters.sourceOrdinal), number: max(schema.chapters.number) })
          .from(schema.chapters)
          .where(eq(schema.chapters.projectId, project.id));
        if (sourceOrdinal !== (bounds?.ordinal ?? 0) + 1) throw AppErrorCode.ING_002.create();

        const landing = { title: body.title, content: body.content, note: body.authorNote ?? null, sourceOrdinal, contentHash: this.digest(body) };
        await landFinalChapters(tx, project.id, [landing], { mode: 'final', startNumber: (bounds?.number ?? 0) + 1 });
        return true;
      })
      .catch(async (error: unknown) => {
        const failure = this.asAppError(error);
        // The audit row must never displace the answer: a trail write that fails is logged and swallowed so
        // the caller still receives its ING_002/ING_003 rather than a 500.
        await this.record('chapter.push', sourceRef, this.outcomeOf(failure), project.id).catch((cause: Error) =>
          this.logger.error('could not record a curated ingest rejection', { sourceRef, sourceOrdinal, reason: cause.message }),
        );
        throw failure;
      });

    await this.record('chapter.push', sourceRef, landed ? 'landed' : 'noop', project.id);
    return { projectId: project.id, landed };
  }

  async setCover(sourceRef: string, image: string, mime: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<void> {
    const project = await this.requireOwned(sourceRef, 'cover.set');
    await this.projectService.setCover(project.id, image, mime);
    await this.record('cover.set', sourceRef, 'applied', project.id);
  }

  /**
   * What the forge holds for this novel, in the scraper's own coordinates — a projection of the digests
   * stamped at land time, never a re-hash, so polling it costs no prose. Only chapters carrying a source
   * ordinal appear: a chapter the forge inserted itself has no counterpart at the source and must not look
   * like one that drifted.
   */
  async manifest(sourceRef: string): Promise<IngestManifestResponse> {
    const project = await this.requireOwned(sourceRef);
    const chapters = await this.db
      .select({ sourceOrdinal: schema.chapters.sourceOrdinal, contentHash: schema.chapters.contentHash })
      .from(schema.chapters)
      .where(and(eq(schema.chapters.projectId, project.id), isNotNull(schema.chapters.sourceOrdinal)))
      .orderBy(asc(schema.chapters.sourceOrdinal));

    return {
      projectId: project.id,
      chapters: chapters.map(chapter => ({ sourceOrdinal: chapter.sourceOrdinal as number, contentHash: chapter.contentHash as string })),
    };
  }

  /** Covers exactly `{ title, content }`, which is all a scraper holds — never the note or the rating the publish digest also spans. */
  private digest(body: IngestChapterBody): string {
    return chapterContentHash({ title: body.title, content: body.content });
  }

  /** A project held by a different owner is answered exactly as one that was never pushed, so the surface is not an id oracle. */
  private async resolveOwned(sourceRef: string): Promise<Project.Row | null> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.sourceRef, sourceRef) });
    if (!project) return null;
    if (project.ownerId === this.owner()) return project;

    this.logger.warn('curated ingest addressed a source reference held by another owner', { sourceRef, projectId: project.id.toString() });
    return null;
  }

  private async requireOwned(sourceRef: string, action?: IngestAction): Promise<Project.Row> {
    const project = await this.resolveOwned(sourceRef);
    if (project) return project;
    if (action) await this.record(action, sourceRef, 'not_found', null);
    throw AppErrorCode.ING_001.create();
  }

  private importedMeta(body: IngestNovelBody): ImportedNovelMetaData | null {
    const meta: ImportedNovelMetaData = {};
    if (body.genres) meta.genres = body.genres;
    if (body.tags) meta.tags = body.tags;
    if (body.sexualContent) meta.sexualContent = body.sexualContent;
    if (body.violence) meta.violence = body.violence;
    if (body.darkContent) meta.darkContent = body.darkContent;
    return Object.keys(meta).length > 0 ? meta : null;
  }

  /** Turns whatever the transaction threw into the error the caller will see, so the audit row names the same outcome the response does. */
  private asAppError(error: unknown): AppError {
    if (AppError.is(error)) return error;
    try {
      this.databaseService.translateError(error);
    } catch (translated) {
      return translated as AppError;
    }
  }

  private outcomeOf(error: AppError): IngestOutcome {
    if (AppError.is(error, AppErrorCode.ING_002)) return 'out_of_order';
    if (AppError.is(error, AppErrorCode.ING_003)) return 'conflict';
    return 'error';
  }

  private owner(): bigint {
    return BigInt(this.context.getAuthPrincipal().sub);
  }

  private async record(action: IngestAction, sourceRef: string, outcome: IngestOutcome, projectId: bigint | null): Promise<void> {
    const apiKeyId = this.context.getAuthPrincipal().claims?.['api_key_id'];
    await this.audit.record({ apiKeyId: typeof apiKeyId === 'string' ? BigInt(apiKeyId) : null, action, sourceRef, projectId, outcome });
  }
}
