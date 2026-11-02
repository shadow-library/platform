import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { chunkText } from './chunker';
import { EmbeddingService, sameTask } from './embedding.service';

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

  // Deletes existing chunks first (idempotent). Resolves true only when every chunk carries an embedding; a chunk stored without one is invisible to retrieval, and
  // `backfill` retries the chapter.
  // carries an embedding; a chunk stored without one is invisible to retrieval, and `backfill` retries the chapter.
  // Containment keys on `isolated`, never on provenance: hand-pasted firewalled prose is `generator: 'human'`.
  async addProse(projectId: bigint, chapter: number, content: string, isolated: boolean): Promise<boolean> {
    if (isolated) {
      this.logger.debug('addProse: skipping isolated chapter (not indexed)', { projectId, chapter });
      return false;
    }

    await this.deleteProse(projectId, chapter);

    const chunks = chunkText(content);
    const texts = chunks.map(c => c.text);
    const embeddings = await this.embeddingService.embedBatch(projectId, texts);
    const task = this.embeddingService.task;
    const embedded = embeddings.filter(Boolean).length;
    this.logger.debug('addProse: embedded chapter', { projectId, chapter, chunks: chunks.length, embedded, failed: chunks.length - embedded });

    await this.db.insert(schema.chapterChunks).values(
      chunks.map((c, i) => ({
        projectId,
        chapter,
        chunkIdx: i,
        text: c.text,
        embedding: embeddings[i] ?? null,
        embeddingTask: embeddings[i] ? task : null,
      })),
    );
    if (embedded < chunks.length) this.logger.warn('addProse: chapter left partly unembedded for the next backfill', { projectId, chapter, chunks: chunks.length, embedded });
    return embedded === chunks.length;
  }

  async deleteProse(projectId: bigint, chapter: number): Promise<void> {
    await this.db.delete(schema.chapterChunks).where(and(eq(schema.chapterChunks.projectId, projectId), eq(schema.chapterChunks.chapter, chapter)));
  }

  // Best-effort: if embed fails, the row is stored with a null embedding.
  async addLore(projectId: bigint, kind: string, refKey: string, text: string, sourceUpdatedAt: Date): Promise<void> {
    const embedding = await this.embeddingService.embed(projectId, text);
    const vector = { embedding, embeddingTask: embedding ? this.embeddingService.task : null };

    await this.db
      .insert(schema.loreChunks)
      .values({ projectId, kind, refKey, text, sourceUpdatedAt, ...vector })
      .onConflictDoUpdate({
        target: [schema.loreChunks.projectId, schema.loreChunks.kind, schema.loreChunks.refKey],
        set: { text, sourceUpdatedAt, ...vector },
      });
  }

  /** `addLore` for many items in one embedding call and one upsert; a repeated `refKey` keeps its last item. Best-effort alike: a failed embed stores the text unembedded. */
  async addLoreBatch(projectId: bigint, kind: string, items: { refKey: string; text: string; sourceUpdatedAt: Date }[]): Promise<void> {
    const unique = [...new Map(items.map(item => [item.refKey, item])).values()];
    if (unique.length === 0) return;
    const embeddings = await this.embeddingService.embedBatch(
      projectId,
      unique.map(item => item.text),
    );
    const task = this.embeddingService.task;

    await this.db
      .insert(schema.loreChunks)
      .values(unique.map((item, i) => ({ projectId, kind, ...item, embedding: embeddings[i] ?? null, embeddingTask: embeddings[i] ? task : null })))
      .onConflictDoUpdate({
        target: [schema.loreChunks.projectId, schema.loreChunks.kind, schema.loreChunks.refKey],
        set: {
          text: sql`excluded.text`,
          sourceUpdatedAt: sql`excluded.source_updated_at`,
          embedding: sql`excluded.embedding`,
          embeddingTask: sql`excluded.embedding_task`,
        },
      });
  }

  // Re-indexes non-isolated 'done' chapters with no chunks, a chunk without an embedding, or one embedded by another task than the current one.
  async backfill(projectId: bigint): Promise<{ indexed: number; skipped: number }> {
    const doneWhere = and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'), isNotNull(schema.chapters.content));
    const [doneChapters, indexedCounts] = await Promise.all([
      this.db.query.chapters.findMany({ columns: { number: true, isolated: true }, where: doneWhere }),
      this.db.execute<{ chapter: number; cnt: number; unembedded: number }>(sql`
        SELECT chapter, COUNT(*)::int AS cnt,
               COUNT(*) FILTER (WHERE embedding IS NULL OR NOT ${sameTask(sql`embedding_task`, this.embeddingService.task)})::int AS unembedded
        FROM chapter_chunks
        WHERE project_id = ${projectId}
        GROUP BY chapter
      `),
    ]);

    const indexableChapters = doneChapters.filter(c => !c.isolated);
    this.logger.info('backfill: reindexing prose', { projectId, doneChapters: doneChapters.length, indexableChapters: indexableChapters.length });

    const indexedChapters = new Set<number>(indexedCounts.filter(r => r.cnt > 0 && r.unembedded === 0).map(r => r.chapter));
    const pending = indexableChapters.filter(chapter => !indexedChapters.has(chapter.number));
    const contents =
      pending.length > 0
        ? await this.db.query.chapters.findMany({
            columns: { number: true, content: true },
            where: and(
              doneWhere,
              inArray(
                schema.chapters.number,
                pending.map(chapter => chapter.number),
              ),
            ),
          })
        : [];
    const contentOf = new Map(contents.map(row => [row.number, row.content]));

    let indexed = 0;
    let skipped = 0;

    for (const chapter of pending) {
      const content = contentOf.get(chapter.number);
      if (!content) continue;
      try {
        if (await this.addProse(projectId, chapter.number, content, chapter.isolated)) indexed++;
        else skipped++;
      } catch (err) {
        this.logger.warn('Backfill failed for chapter', { projectId, chapter: chapter.number, err });
        skipped++;
      }
    }

    this.logger.info('backfill: complete', { projectId, indexed, skipped });
    return { indexed, skipped };
  }
}
