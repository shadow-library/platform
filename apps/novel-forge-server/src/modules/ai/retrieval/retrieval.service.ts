/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { eq, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { EmbeddingService } from './embedding.service';

/**
 * Defining types
 */

export interface RetrievalHit {
  text: string;
  score: number; // 1 - cosine_distance (higher = more similar)
  metadata: {
    chapter?: number;
    kind?: string;
    refKey?: string;
  };
}

/**
 * Declaring the constants
 */

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

  // Search prose index. Excludes grok chapters. Returns [] for grok_only projects or on embed failure.
  async searchProse(projectId: bigint, query: string, k = DEFAULT_PROSE_K): Promise<RetrievalHit[]> {
    try {
      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (project?.contentMode === 'grok_only') return [];

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
          AND ch.generator != 'grok'
        ORDER BY cc.embedding <=> ${sql.raw(`'${vecLiteral}'`)}::vector
        LIMIT ${k}
      `);

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

  // Search lore index. Filter by kinds[] if provided. Returns [] for grok_only projects or on embed failure.
  async searchLore(projectId: bigint, query: string, k = DEFAULT_LORE_K, opts?: { kinds?: string[] }): Promise<RetrievalHit[]> {
    try {
      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (project?.contentMode === 'grok_only') return [];

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
