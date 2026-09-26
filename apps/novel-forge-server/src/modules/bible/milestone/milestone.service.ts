import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { assertMilestoneSubject, findMilestoneReferences, lockProjectPlan } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

import { type CreateMilestoneBody, type UpdateMilestoneBody } from './milestone.dto';

/** Authors the milestone records; their state is derived by plan writes and finalization, never set here. */
@Injectable()
export class MilestoneService {
  private readonly logger = Logger.getLogger(APP_NAME, MilestoneService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  list(projectId: bigint): Promise<Knowledge.Milestone[]> {
    return this.db.query.milestones.findMany({ where: eq(schema.milestones.projectId, projectId), orderBy: [asc(schema.milestones.createdAt), asc(schema.milestones.id)] });
  }

  async create(projectId: bigint, body: CreateMilestoneBody): Promise<Knowledge.Milestone> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { id: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    const subjectEntityKey = body.subjectEntityKey?.trim() || null;
    if (subjectEntityKey) await assertMilestoneSubject(this.db, projectId, subjectEntityKey);
    const [created] = await this.db
      .insert(schema.milestones)
      .values({ projectId, milestoneKey: body.milestoneKey, label: body.label.trim(), subjectEntityKey, kind: body.kind ?? 'custom' })
      .onConflictDoNothing({ target: [schema.milestones.projectId, schema.milestones.milestoneKey] })
      .returning();
    if (!created) throw AppErrorCode.MIL_002.create();
    this.logger.info('milestone created', { projectId, milestoneKey: body.milestoneKey });
    return created;
  }

  async update(projectId: bigint, milestoneKey: string, body: UpdateMilestoneBody): Promise<Knowledge.Milestone> {
    const edits: Partial<typeof schema.milestones.$inferInsert> = { updatedAt: new Date() };
    if (body.label !== undefined) edits.label = body.label.trim();
    if (body.subjectEntityKey !== undefined) edits.subjectEntityKey = body.subjectEntityKey?.trim() || null;
    if (edits.subjectEntityKey) await assertMilestoneSubject(this.db, projectId, edits.subjectEntityKey);
    if (body.kind !== undefined) edits.kind = body.kind;
    const [updated] = await this.db
      .update(schema.milestones)
      .set(edits)
      .where(and(eq(schema.milestones.projectId, projectId), eq(schema.milestones.milestoneKey, milestoneKey)))
      .returning();
    if (!updated) throw AppErrorCode.MIL_001.create();
    return updated;
  }

  async delete(projectId: bigint, milestoneKey: string): Promise<void> {
    await this.db.transaction(async tx => {
      await lockProjectPlan(tx, projectId);
      const references = await findMilestoneReferences(tx, projectId, milestoneKey);
      if (references.length > 0) throw AppErrorCode.MIL_003.create({ milestoneKey, references: references.join(', ') });
      const deleted = await tx
        .delete(schema.milestones)
        .where(and(eq(schema.milestones.projectId, projectId), eq(schema.milestones.milestoneKey, milestoneKey)))
        .returning({ id: schema.milestones.id });
      if (deleted.length === 0) throw AppErrorCode.MIL_001.create();
    });
    this.logger.info('milestone deleted', { projectId, milestoneKey });
  }
}
