/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
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

  get(projectId: bigint, section: Bible.Section, slug: string): Promise<Bible.Document | null> {
    return this.db.query.bibleDocuments
      .findFirst({
        where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, section), eq(schema.bibleDocuments.slug, slug)),
      })
      .then(r => r ?? null);
  }

  async upsert(projectId: bigint, section: Bible.Section, slug: string, body: UpsertBibleDocBody): Promise<Bible.Document> {
    const [doc] = await this.db
      .insert(schema.bibleDocuments)
      .values({ projectId, section, slug, frontmatter: body.frontmatter, body: body.body })
      .onConflictDoUpdate({
        target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
        set: { frontmatter: body.frontmatter, body: body.body, updatedAt: new Date() },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!doc) throw new Error('Bible document upsert failed unexpectedly');
    return doc;
  }
}
