import { count, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { type BibleReadinessReport, scoreBibleReadiness } from '@modules/eval/bible-readiness';

import { AppErrorCode } from '@server/classes';
import { deriveBibleDocTitle } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

@Injectable()
export class BibleReadinessService {
  private readonly logger = Logger.getLogger(APP_NAME, BibleReadinessService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async score(projectId: bigint): Promise<BibleReadinessReport> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { id: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const [documents, entities, facts, volumes, [arcs]] = await Promise.all([
      this.db.query.bibleDocuments.findMany({
        where: eq(schema.bibleDocuments.projectId, projectId),
        columns: { section: true, slug: true, frontmatter: true, body: true },
      }),
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), columns: { entityKey: true, type: true, significance: true, body: true } }),
      this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), columns: { factKey: true, subjects: true, revealChapter: true } }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), columns: { volumeKey: true, objective: true } }),
      this.db.select({ total: count() }).from(schema.arcs).where(eq(schema.arcs.projectId, projectId)),
    ]);

    const docs = documents.map(doc => ({ section: doc.section, slug: doc.slug, title: deriveBibleDocTitle(doc), body: doc.body }));
    const report = scoreBibleReadiness({ docs, entities, facts, volumes, arcCount: arcs?.total ?? 0 });
    this.logger.info('bible readiness scored', {
      projectId,
      readyToDraft: report.readyToDraft,
      verdicts: report.dimensions.map(entry => `${entry.dimension}:${entry.verdict}`),
      uncoveredRoles: report.roles.filter(role => !role.covered).map(role => role.stage),
    });
    return report;
  }
}
