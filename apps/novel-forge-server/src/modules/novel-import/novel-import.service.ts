/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, ValidationError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { type ImportNovelBody, type ImportNovelResponse } from './novel-import.dto';
import { validateNovelBundle } from './novel-import.validator';

/**
 * Defining types
 */

// Persisted verbatim on `jobs.payload` — the transaction that creates the project is the only place
// the bundle's chapter text and cover asset are ever staged, so the executor rereads them from here
// rather than the request (which is long gone by the time the job runs).
export interface ImportJobPayload {
  mode: 'final' | 'source';
  chapters: { title: string; content: string }[];
  cover?: { mimeType: string; dataBase64: string };
}

/**
 * Declaring the constants
 */

@Injectable()
export class NovelImportService {
  private readonly logger = Logger.getLogger(APP_NAME, NovelImportService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly context: ContextService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Validates the bundle fully, then creates the `projects` row and enqueues the `import` job in one
   * transaction — either both exist or neither does. The job itself (`JobExecutor.runImport`) does the
   * actual chapter/cover writes; this method never touches `chapters`.
   */
  async import(body: ImportNovelBody): Promise<ImportNovelResponse> {
    const bundle = body.bundle;
    const validation = validateNovelBundle(bundle);
    if (validation.issues.length > 0) {
      const error = new ValidationError();
      for (const issue of validation.issues) error.addFieldError(issue.field, issue.msg);
      throw error;
    }

    const ownerId = BigInt(this.context.getAuthPrincipal().sub);
    const kind: Project.Kind = bundle.mode === 'final' ? 'new_novel' : 'source';
    const cover = bundle.novel.cover ? (bundle.assets ?? []).find(a => a.name === bundle.novel.cover) : undefined;

    const { projectId, jobId } = await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;

      const [project] = await tx
        .insert(schema.projects)
        .values({
          ownerId,
          name: bundle.novel.title,
          kind,
          title: bundle.novel.title,
          brief: bundle.novel.synopsis,
          themes: bundle.novel.tags ?? null,
          instructions: bundle.novel.instructions?.trim() || null,
        })
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!project) throw AppError.internal('novel-import: failed to create project');

      // Mirrors ProjectService.create: a `new_novel` project is born with contentless `<section>/default`
      // placeholder bible docs; a `source` project gets none (the source pipeline creates its own).
      if (kind === 'new_novel') {
        await tx.insert(schema.bibleDocuments).values(schema.bibleSection.enumValues.map(section => ({ projectId: project.id, section, slug: 'default' })));
      }

      const payload: ImportJobPayload = {
        mode: bundle.mode,
        chapters: validation.chapters.map(c => ({ title: c.title, content: c.content })),
        cover: cover ? { mimeType: cover.mimeType, dataBase64: cover.dataBase64 } : undefined,
      };

      const [job] = await tx
        .insert(schema.jobs)
        .values({ projectId: project.id, kind: 'import', target: `import-${project.id}`, payload: payload as never })
        .returning({ id: schema.jobs.id });
      if (!job) throw AppError.internal('novel-import: failed to enqueue import job');

      return { projectId: project.id, jobId: job.id };
    });

    this.logger.info('novel bundle accepted', { projectId, jobId, mode: bundle.mode, chapters: validation.chapters.length, hasCover: !!cover });
    return { projectId, jobId };
  }
}
