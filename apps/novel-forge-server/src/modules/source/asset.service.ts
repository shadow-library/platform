/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';
import { asc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Renders the extracted knowledge for a project as a Markdown string.
 *
 * Used for display and export — no LLM call, purely a DB read + template render.
 */
@Injectable()
export class AssetService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async render(projectId: bigint): Promise<string> {
    const [entitiesRows, threadsRows, worldFactsRows, mysteriesRows] = await Promise.all([
      this.db.query.entities.findMany({
        where: eq(schema.entities.projectId, projectId),
        orderBy: [asc(schema.entities.type), asc(schema.entities.name)],
      }),
      this.db.query.plotThreads.findMany({ where: eq(schema.plotThreads.projectId, projectId) }),
      this.db.query.worldFacts.findMany({
        where: eq(schema.worldFacts.projectId, projectId),
        orderBy: [asc(schema.worldFacts.category), asc(schema.worldFacts.key)],
      }),
      this.db.query.mysteries.findMany({ where: eq(schema.mysteries.projectId, projectId) }),
    ]);

    const sections: string[] = [];

    if (entitiesRows.length > 0) {
      sections.push('## Entities\n');
      for (const e of entitiesRows) {
        sections.push(`### ${e.name} (${e.type}${e.significance ? ', ' + e.significance : ''})\n`);
        if (e.notes) sections.push(e.notes + '\n');
      }
    }

    if (threadsRows.length > 0) {
      sections.push('## Plot Threads\n');
      for (const t of threadsRows) {
        sections.push(`- **${t.threadKey}** [${t.status}]: ${t.summary ?? ''}\n`);
      }
    }

    if (worldFactsRows.length > 0) {
      sections.push('## World Facts\n');
      let lastCat = '';
      for (const f of worldFactsRows) {
        if (f.category !== lastCat) {
          sections.push(`\n### ${f.category}\n`);
          lastCat = f.category;
        }
        sections.push(`- **${f.key}**: ${f.value}\n`);
      }
    }

    if (mysteriesRows.length > 0) {
      sections.push('## Mysteries\n');
      for (const m of mysteriesRows) {
        sections.push(`- **${m.mysteryKey}** [${m.status}]: ${m.question}\n`);
      }
    }

    return sections.join('\n');
  }
}
