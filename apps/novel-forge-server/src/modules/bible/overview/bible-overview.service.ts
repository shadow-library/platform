import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { bibleRoles, unresolvedFactSubjects } from '@modules/eval/bible-readiness';

import { AppErrorCode } from '@server/classes';
import { deriveBibleDocTitle } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

import { type BibleOverviewResponse } from './bible-overview.dto';

@Injectable()
export class BibleOverviewService {
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async overview(projectId: bigint): Promise<BibleOverviewResponse> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { id: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const [documents, entities, facts, volumes] = await Promise.all([
      this.db.query.bibleDocuments.findMany({
        where: eq(schema.bibleDocuments.projectId, projectId),
        columns: { section: true, slug: true, frontmatter: true, body: true },
      }),
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), columns: { entityKey: true, type: true, significance: true } }),
      this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), columns: { factKey: true, subjects: true } }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), columns: { volumeKey: true, objective: true } }),
    ]);

    const docs = documents.map(doc => ({ section: doc.section, slug: doc.slug, title: deriveBibleDocTitle(doc), body: doc.body }));
    const roles = bibleRoles({ docs, entities, facts, volumes }).map(({ stage, label, coveredBy }) => ({ stage, label, coveredBy }));
    return { roles, unresolvedReferences: unresolvedFactSubjects(entities, facts) };
  }
}
