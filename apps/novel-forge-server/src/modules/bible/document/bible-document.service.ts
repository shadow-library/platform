import { and, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { bibleDocExcerpt, bibleDocLabel, hasBibleContent } from '@modules/ai/context/bible-docs';
import { countWords } from '@modules/eval/deterministic-metrics';

import { computeBibleDocHash, ensureBibleDocTitle } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Bible, type DbExecutor, type PrimaryDatabase, schema } from '@server/database';

import { type BibleDocListItem, type UpsertBibleDocBody } from './bible-document.dto';

const LIST_EXCERPT_CHARS = 140;

@Injectable()
export class BibleDocumentService {
  private readonly logger = Logger.getLogger(APP_NAME, BibleDocumentService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint): Promise<BibleDocListItem[]> {
    const rows = await this.db.query.bibleDocuments.findMany({
      where: eq(schema.bibleDocuments.projectId, projectId),
      columns: { section: true, slug: true, frontmatter: true, body: true, updatedAt: true },
      orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug],
    });
    return rows.map(row => {
      const isEmpty = !hasBibleContent(row);
      return {
        section: row.section,
        slug: row.slug,
        title: bibleDocLabel(row),
        wordCount: countWords(row.body ?? ''),
        isEmpty,
        excerpt: isEmpty ? undefined : bibleDocExcerpt(row, LIST_EXCERPT_CHARS) || undefined,
        updatedAt: row.updatedAt,
      };
    });
  }

  get(projectId: bigint, section: Bible.Section, slug: string, executor: DbExecutor = this.db): Promise<Bible.Document | null> {
    return executor.query.bibleDocuments
      .findFirst({
        where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, section), eq(schema.bibleDocuments.slug, slug)),
      })
      .then(r => r ?? null);
  }

  /** `executor` lets a caller that already owns a transaction — graduation, say — write the document inside it. */
  async upsert(projectId: bigint, section: Bible.Section, slug: string, body: UpsertBibleDocBody, executor?: DbExecutor): Promise<Bible.Document> {
    const existing = await this.get(projectId, section, slug, executor);
    // Hashed both ways: a title folded into a document whose stored hash predates title derivation
    // must read as the same content, not as an edit — the raw hash is what that stored hash was computed from.
    const rawHash = computeBibleDocHash(body.frontmatter, body.body);
    const frontmatter = ensureBibleDocTitle({ slug, frontmatter: body.frontmatter, body: body.body });
    const contentHash = computeBibleDocHash(frontmatter, body.body);

    // Already folded and identical — nothing to write.
    if (existing && existing.contentHash === contentHash) return existing;

    if (existing && existing.contentHash === rawHash) {
      const target = and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, section), eq(schema.bibleDocuments.slug, slug));
      const [row] = await (executor ?? this.db).update(schema.bibleDocuments).set({ frontmatter, contentHash, updatedAt: new Date() }).where(target).returning();
      if (!row) throw AppError.internal('Bible document title backfill failed unexpectedly');
      return row;
    }

    // Bumping the revision and invalidating dependents happens atomically: a bible edit that survives
    // must always mark the chapters validated against the prior canon as needing re-validation.
    const write = async (tx: DbExecutor): Promise<Bible.Document | undefined> => {
      const [row] = await tx
        .insert(schema.bibleDocuments)
        .values({ projectId, section, slug, frontmatter, body: body.body, contentHash, revision: 1 })
        .onConflictDoUpdate({
          target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
          set: { frontmatter, body: body.body, contentHash, revision: sql`${schema.bibleDocuments.revision} + 1`, updatedAt: new Date() },
        })
        .returning();

      // A canon change can affect any chapter — flag every finalized chapter of the project for re-validation.
      await tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, projectId));

      return row;
    };
    const doc = executor ? await write(executor) : await this.db.transaction(write);

    if (!doc) throw AppError.internal('Bible document upsert failed unexpectedly');
    return doc;
  }
}
