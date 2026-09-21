import { Injectable } from '@shadow-library/app';
import { AppError, Logger, ValidationError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { type Genre, NOVEL_GENRES } from '@shadow-library/sdk';

import { volumeContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { ActorService, projectOwnerColumns } from '@modules/actor';

import { assertUnderProjectCap } from '../project/project/project-limits';
import { type ImportNovelBody, type ImportNovelResponse } from './novel-import.dto';
import { validateNovelBundle } from './novel-import.validator';

// Persisted verbatim on `jobs.payload` — the transaction that creates the project is the only place
// the bundle's chapter text and cover asset are ever staged, so the executor rereads them from here
// rather than the request (which is long gone by the time the job runs).
export interface ImportJobPayload {
  mode: 'final' | 'source';
  chapters: { title: string; content: string }[];
  cover?: { mimeType: string; dataBase64: string };
}

function matchGenre(value: string): Genre | undefined {
  const wanted = value.trim().toLowerCase();
  return NOVEL_GENRES.find(genre => genre.toLowerCase() === wanted);
}

@Injectable()
export class NovelImportService {
  private readonly logger = Logger.getLogger(APP_NAME, NovelImportService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly actorService: ActorService,
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

    const actor = this.actorService.current();
    await assertUnderProjectCap(this.db, actor);
    const kind: Project.Kind = bundle.mode === 'final' ? 'new_novel' : 'source';
    const cover = bundle.novel.cover ? (bundle.assets ?? []).find(a => a.name === bundle.novel.cover) : undefined;
    const warnings: string[] = [];
    const genre = bundle.novel.genre?.trim() ? matchGenre(bundle.novel.genre) : undefined;
    if (bundle.novel.genre?.trim() && !genre) warnings.push(`novel.genre '${bundle.novel.genre}' is not one of the platform genres and was not stored`);
    const titledVolumes = validation.volumes.filter(volume => volume.title !== null);
    if (kind === 'source' && titledVolumes.length > 0) warnings.push(`volume titles are not stored for a source-mode import (${titledVolumes.length} ignored)`);

    const { projectId, jobId } = await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;

      const [project] = await tx
        .insert(schema.projects)
        .values({
          ...projectOwnerColumns(actor),
          name: bundle.novel.title,
          kind,
          title: bundle.novel.title,
          brief: bundle.novel.synopsis,
          themes: bundle.novel.tags ?? null,
          instructions: bundle.novel.instructions?.trim() || null,
          importedMeta: genre ? { genres: [genre] } : null,
        })
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!project) throw AppError.internal('novel-import: failed to create project');

      // Mirrors ProjectService.create: a `new_novel` project is born with contentless `<section>/default`
      // placeholder bible docs; a `source` project gets none (the source pipeline creates its own).
      if (kind === 'new_novel') {
        await tx.insert(schema.bibleDocuments).values(schema.bibleSection.enumValues.map(section => ({ projectId: project.id, section, slug: 'default' })));
        await tx.insert(schema.volumes).values(
          validation.volumes.map(volume => {
            const values = {
              volumeKey: `volume_${volume.ordinal}`,
              ordinal: volume.ordinal,
              title: volume.title,
              startChapter: volume.startChapter,
              endChapter: volume.endChapter,
              targetChapterCount: volume.endChapter - volume.startChapter + 1,
            };
            return { projectId: project.id, ...values, status: 'source' as const, contentHash: volumeContentHash(values) };
          }),
        );
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

    this.logger.info('novel bundle accepted', { projectId, jobId, mode: bundle.mode, chapters: validation.chapters.length, hasCover: !!cover, warnings: warnings.length });
    return { projectId, jobId, warnings };
  }
}
