/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { chunkText } from './chunker';
import { EmbeddingService } from './embedding.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class IndexingService {
  private readonly logger = Logger.getLogger(APP_NAME, IndexingService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // Add (or re-add) prose chunks for a chapter. Deletes existing chunks first (idempotent).
  // Does NOT embed grok chapters — silently skips if generator === 'grok'.
  async addProse(projectId: bigint, chapter: number, content: string, generator: string): Promise<void> {
    if (generator === 'grok') {
      this.logger.debug('addProse: skipping grok chapter (not indexed)', { projectId, chapter });
      return;
    }

    await this.deleteProse(projectId, chapter);

    const chunks = chunkText(content);
    const texts = chunks.map(c => c.text);
    const embeddings = await this.embeddingService.embedBatch(texts);
    const embedded = embeddings.filter(Boolean).length;
    this.logger.debug('addProse: embedded chapter', { projectId, chapter, chunks: chunks.length, embedded, failed: chunks.length - embedded });

    await this.db.insert(schema.chapterChunks).values(
      chunks.map((c, i) => ({
        projectId,
        chapter,
        chunkIdx: i,
        text: c.text,
        embedding: embeddings[i] ?? null,
      })),
    );
  }

  // Delete all chapter_chunks for (projectId, chapter).
  async deleteProse(projectId: bigint, chapter: number): Promise<void> {
    await this.db.delete(schema.chapterChunks).where(and(eq(schema.chapterChunks.projectId, projectId), eq(schema.chapterChunks.chapter, chapter)));
  }

  // Upsert a single lore chunk by (projectId, kind, refKey).
  // Best-effort: if embed fails, inserts row with null embedding.
  async addLore(projectId: bigint, kind: string, refKey: string, text: string, sourceUpdatedAt: Date): Promise<void> {
    const embedding = await this.embeddingService.embed(text);

    await this.db
      .insert(schema.loreChunks)
      .values({ projectId, kind, refKey, text, sourceUpdatedAt, embedding: embedding ?? null })
      .onConflictDoUpdate({
        target: [schema.loreChunks.projectId, schema.loreChunks.kind, schema.loreChunks.refKey],
        set: { text, embedding: embedding ?? null, sourceUpdatedAt },
      });
  }

  // Backfill: find all chapters for projectId with status='done' and generator!='grok'
  // that have zero chapter_chunks rows, then addProse for each.
  // Returns { indexed, skipped } (skipped = content null/empty).
  async backfill(projectId: bigint): Promise<{ indexed: number; skipped: number }> {
    const doneChapters = await this.db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
    });

    const standardChapters = doneChapters.filter(c => c.generator !== 'grok');
    this.logger.info('backfill: reindexing prose', { projectId, doneChapters: doneChapters.length, standardChapters: standardChapters.length });

    // Find chapters that already have chunks.
    const indexedCounts = await this.db.execute<{ chapter: number; cnt: number }>(sql`
      SELECT chapter, COUNT(*)::int AS cnt
      FROM chapter_chunks
      WHERE project_id = ${projectId}
      GROUP BY chapter
    `);

    const indexedChapters = new Set<number>(indexedCounts.filter(r => r.cnt > 0).map(r => r.chapter));

    let indexed = 0;
    let skipped = 0;

    for (const chapter of standardChapters) {
      if (indexedChapters.has(chapter.number)) continue;
      if (!chapter.content) {
        skipped++;
        continue;
      }
      try {
        await this.addProse(projectId, chapter.number, chapter.content, chapter.generator);
        indexed++;
      } catch (err) {
        this.logger.warn('Backfill failed for chapter', { projectId, chapter: chapter.number, err });
        skipped++;
      }
    }

    this.logger.info('backfill: complete', { projectId, indexed, skipped });
    return { indexed, skipped };
  }
}
