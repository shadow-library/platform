import { sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';

import { EmbeddingService } from './embedding.service';

export interface RetrievalHit {
  text: string;
  score: number; // 1 - cosine_distance (higher = more similar)
  metadata: {
    chapter?: number;
    kind?: string;
    refKey?: string;
  };
}

const DEFAULT_PROSE_K = 5;
const DEFAULT_LORE_K = 6;

@Injectable()
export class RetrievalService {
  private readonly logger = Logger.getLogger(APP_NAME, RetrievalService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // Search prose index. Excludes isolated chapters, whatever their provenance. Returns [] on embed failure.
  async searchProse(projectId: bigint, query: string, k = DEFAULT_PROSE_K): Promise<RetrievalHit[]> {
    try {
      const embedding = await this.embeddingService.embed(query);
      if (!embedding) return [];

      const vecLiteral = `[${embedding.join(',')}]`;

      const rows = await this.db.execute<{ chapter: number; text: string; score: number }>(sql`
        SELECT cc.chapter, cc.text,
               (1 - (cc.embedding <=> ${sql.raw(`'${vecLiteral}'`)}::vector))::float4 AS score
        FROM chapter_chunks cc
        JOIN chapters ch ON ch.project_id = cc.project_id AND ch.number = cc.chapter
        WHERE cc.project_id = ${projectId}
          AND cc.embedding IS NOT NULL
          AND ch.isolated = false
        ORDER BY cc.embedding <=> ${sql.raw(`'${vecLiteral}'`)}::vector
        LIMIT ${k}
      `);

      this.logger.debug('searchProse', { projectId, query, k, hits: rows.length, topScore: rows[0]?.score });
      return rows.map(row => ({
        text: row.text,
        score: row.score,
        metadata: { chapter: row.chapter },
      }));
    } catch (err) {
      this.logger.warn('searchProse failed', { projectId, err });
      return [];
    }
  }

  // Search lore index. Filter by kinds[] if provided. Returns [] on embed failure.
  async searchLore(projectId: bigint, query: string, k = DEFAULT_LORE_K, opts?: { kinds?: string[] }): Promise<RetrievalHit[]> {
    try {
      const embedding = await this.embeddingService.embed(query);
      if (!embedding) return [];

      const vecLiteral = `[${embedding.join(',')}]`;
      const kinds = opts?.kinds;
      const kindFilter = kinds && kinds.length > 0 ? sql`AND lc.kind = ANY(ARRAY[${sql.raw(kinds.map(k => `'${k}'`).join(','))}]::varchar[])` : sql``;

      const loreRows = await this.db.execute<{ kind: string; refKey: string; text: string; score: number }>(sql`
        SELECT lc.kind, lc.ref_key AS "refKey", lc.text,
               (1 - (lc.embedding <=> ${sql.raw(`'${vecLiteral}'`)}::vector))::float4 AS score
        FROM lore_chunks lc
        WHERE lc.project_id = ${projectId}
          AND lc.embedding IS NOT NULL
          ${kindFilter}
        ORDER BY lc.embedding <=> ${sql.raw(`'${vecLiteral}'`)}::vector
        LIMIT ${k}
      `);

      this.logger.debug('searchLore', { projectId, query, k, kinds: opts?.kinds, hits: loreRows.length, topScore: loreRows[0]?.score });
      return loreRows.map(row => ({
        text: row.text,
        score: row.score,
        metadata: { kind: row.kind, refKey: row.refKey },
      }));
    } catch (err) {
      this.logger.warn('searchLore failed', { projectId, err });
      return [];
    }
  }
}
