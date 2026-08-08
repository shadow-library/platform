import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Reforge, schema } from '@server/database';

export interface ReforgeConfigUpdate {
  instructions?: string | null;
  fidelity?: Reforge.Fidelity;
  settings?: Reforge.Settings;
}

export interface ReforgeStatusResult {
  reforge: Reforge.Row;
  sourceChapters: number;
  glossaryCount: number;
  counts: { reforged: number; attention: number; failed: number };
}

export interface ReforgeSummary {
  chapter: number;
  title: string | null;
  status: Reforge.ChapterStatus;
  issueCount: number;
  wordCount: number | null;
  revision: number;
  updatedAt: Date;
}

@Injectable()
export class ReforgeService {
  private readonly logger = Logger.getLogger(APP_NAME, ReforgeService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Upsert-on-read: the reforge row exists from the first touch, so config and status never 404. */
  async getOrCreate(projectId: bigint): Promise<Reforge.Row> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.kind !== 'source') throw AppErrorCode.REF_003.create();

    const existing = await this.db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) });
    if (existing) return existing;

    const [inserted] = await this.db.insert(schema.reforges).values({ projectId }).onConflictDoNothing().returning();
    if (inserted) return inserted;
    const raced = await this.db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) });
    if (!raced) throw AppErrorCode.REF_001.create();
    return raced;
  }

  async updateConfig(projectId: bigint, update: ReforgeConfigUpdate): Promise<Reforge.Row> {
    const reforge = await this.getOrCreate(projectId);
    const set: Partial<typeof schema.reforges.$inferInsert> = { updatedAt: new Date() };
    if (update.instructions !== undefined) set.instructions = update.instructions;
    if (update.fidelity !== undefined) set.fidelity = update.fidelity;
    if (update.settings !== undefined) set.settings = update.settings;
    this.logger.info('reforge config updated', {
      projectId,
      instructionsChanged: update.instructions !== undefined,
      fidelityChanged: update.fidelity !== undefined,
      settingsChanged: update.settings !== undefined,
    });
    this.logger.debug('reforge config payload', { projectId, instructions: update.instructions, fidelity: update.fidelity, settings: update.settings });
    const [updated] = await this.db.update(schema.reforges).set(set).where(eq(schema.reforges.id, reforge.id)).returning();
    return updated ?? reforge;
  }

  async status(projectId: bigint): Promise<ReforgeStatusResult> {
    const reforge = await this.getOrCreate(projectId);
    const [statusRows, [chapterCount], [glossaryCount]] = await Promise.all([
      this.db
        .select({ status: schema.chapterReforges.status, count: sql<number>`count(*)::int` })
        .from(schema.chapterReforges)
        .where(eq(schema.chapterReforges.projectId, projectId))
        .groupBy(schema.chapterReforges.status),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, projectId)),
      // The rename bible is shared with rebrand; the glossary count reflects the same table.
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.rebrandGlossary)
        .where(eq(schema.rebrandGlossary.projectId, projectId)),
    ]);

    const counts = { reforged: 0, attention: 0, failed: 0 };
    for (const row of statusRows) counts[row.status] = row.count;

    return { reforge, sourceChapters: chapterCount?.count ?? 0, glossaryCount: glossaryCount?.count ?? 0, counts };
  }

  async listReforges(projectId: bigint): Promise<ReforgeSummary[]> {
    const rows = await this.db.query.chapterReforges.findMany({
      where: eq(schema.chapterReforges.projectId, projectId),
      orderBy: [asc(schema.chapterReforges.chapter)],
      columns: { chapter: true, title: true, status: true, issues: true, wordCount: true, revision: true, updatedAt: true },
    });
    return rows.map(r => ({
      chapter: r.chapter,
      title: r.title,
      status: r.status,
      issueCount: Array.isArray(r.issues) ? r.issues.length : 0,
      wordCount: r.wordCount,
      revision: r.revision,
      updatedAt: r.updatedAt,
    }));
  }

  async getReforge(projectId: bigint, chapter: number): Promise<Reforge.Chapter> {
    const reforge = await this.db.query.chapterReforges.findFirst({
      where: and(eq(schema.chapterReforges.projectId, projectId), eq(schema.chapterReforges.chapter, chapter)),
    });
    if (!reforge) throw AppErrorCode.REF_002.create();
    return reforge;
  }

  async renderManuscript(projectId: bigint): Promise<string> {
    const reforges = await this.db.query.chapterReforges.findMany({
      where: and(eq(schema.chapterReforges.projectId, projectId), ne(schema.chapterReforges.status, 'failed')),
      orderBy: [asc(schema.chapterReforges.chapter)],
    });
    return reforges.map(r => `# ${r.title ?? `Chapter ${r.chapter}`}\n\n${r.body}`).join('\n\n---\n\n');
  }
}
