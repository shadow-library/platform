/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { computeBibleDocHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Bible, type PrimaryDatabase, schema } from '@server/database';

import { type UpsertBibleDocBody } from './bible-document.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class BibleDocumentService {
  private readonly logger = Logger.getLogger(APP_NAME, BibleDocumentService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  list(projectId: bigint): Promise<{ section: Bible.Section; slug: string; updatedAt: Date }[]> {
    return this.db.query.bibleDocuments.findMany({
      where: eq(schema.bibleDocuments.projectId, projectId),
      columns: { section: true, slug: true, updatedAt: true },
      orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug],
    });
  }

  get(projectId: bigint, section: Bible.Section, slug: string): Promise<Bible.Document | null> {
    return this.db.query.bibleDocuments
      .findFirst({
        where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, section), eq(schema.bibleDocuments.slug, slug)),
      })
      .then(r => r ?? null);
  }

  async upsert(projectId: bigint, section: Bible.Section, slug: string, body: UpsertBibleDocBody): Promise<Bible.Document> {
    const existing = await this.get(projectId, section, slug);
    const contentHash = computeBibleDocHash(body.frontmatter, body.body);
    const contentChanged = !existing || existing.contentHash !== contentHash;

    // Canon that already exists and did not change must not bump its revision or invalidate chapters.
    if (existing && !contentChanged) return existing;

    // Bumping the revision and invalidating dependents happens atomically: a bible edit that survives
    // must always mark the chapters validated against the prior canon as needing re-validation.
    const doc = await this.db.transaction(async tx => {
      const [row] = await tx
        .insert(schema.bibleDocuments)
        .values({ projectId, section, slug, frontmatter: body.frontmatter, body: body.body, contentHash, revision: 1 })
        .onConflictDoUpdate({
          target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
          set: { frontmatter: body.frontmatter, body: body.body, contentHash, revision: sql`${schema.bibleDocuments.revision} + 1`, updatedAt: new Date() },
        })
        .returning();

      // A canon change can affect any chapter — flag every finalized chapter of the project for re-validation.
      await tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, projectId));

      return row;
    });

    if (!doc) throw new Error('Bible document upsert failed unexpectedly');
    return doc;
  }
}
