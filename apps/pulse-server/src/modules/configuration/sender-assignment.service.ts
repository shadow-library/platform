/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { InferInsertModel, and, asc, desc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { Configuration, DatastoreService, PrimaryDatabase, Template, schema } from '../datastore';

/**
 * Defining types
 */

export interface SenderAssignmentDetails extends Configuration.SenderProfileAssignment {
  profile: Configuration.SenderProfile;
}

export interface ListSenderAssignmentsQuery extends Partial<OffsetPagination> {
  messageType?: Template.MessageType;
  region?: string;
  serviceName?: string;
}

export type CreateSenderAssignment = Omit<InferInsertModel<typeof schema.senderProfileAssignments>, 'createdAt' | 'updatedAt'>;

export type UpdateSenderAssignment = Partial<Pick<CreateSenderAssignment, 'senderProfileId'>>;

/**
 * Declaring the constants
 */

@Injectable()
export class SenderAssignmentService {
  private readonly logger = Logger.getLogger(APP_NAME, SenderAssignmentService.name);

  private readonly db: PrimaryDatabase;

  constructor(private readonly datastoreService: DatastoreService) {
    this.db = datastoreService.getPrimaryDatabase();
  }

  async createSenderAssignment(data: CreateSenderAssignment): Promise<Configuration.SenderProfileAssignment> {
    const profile = await this.db.query.senderProfiles.findFirst({ where: eq(schema.senderProfiles.id, data.senderProfileId) });
    if (!profile) throw new ServerError(AppErrorCode.SND_PRF_001);
    if (!profile.isActive) throw new ServerError(AppErrorCode.SND_ASGN_003);

    const [assignment] = await this.db
      .insert(schema.senderProfileAssignments)
      .values(data)
      .returning()
      .catch(err => this.datastoreService.translateError(err));
    assert(assignment, 'Failed to create sender assignment');
    this.logger.info('Created sender assignment', { assignment });
    return assignment;
  }

  async listSenderAssignments(filter: ListSenderAssignmentsQuery = {}): Promise<OffsetPaginationResult<Configuration.SenderProfileAssignment>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    const sortField = query.sortBy === 'createdAt' ? schema.senderProfileAssignments.createdAt : schema.senderProfileAssignments.updatedAt;
    const whereConditions = [];
    if (filter.messageType) whereConditions.push(eq(schema.senderProfileAssignments.messageType, filter.messageType));
    if (filter.region) whereConditions.push(eq(schema.senderProfileAssignments.region, filter.region));
    if (filter.serviceName) whereConditions.push(eq(schema.senderProfileAssignments.serviceName, filter.serviceName));
    const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const [total, items] = await Promise.all([
      this.db.$count(schema.senderProfileAssignments, where),
      this.db.query.senderProfileAssignments.findMany({ limit: query.limit, offset: query.offset, orderBy: sortOrder(sortField), where }),
    ]);
    return utils.pagination.createResult(query, items, total);
  }

  async getSenderAssignment(serviceName: string, messageType: Template.MessageType, region: string): Promise<SenderAssignmentDetails | null> {
    const assignment = await this.db.query.senderProfileAssignments.findFirst({
      where: and(
        eq(schema.senderProfileAssignments.serviceName, serviceName),
        eq(schema.senderProfileAssignments.messageType, messageType),
        eq(schema.senderProfileAssignments.region, region),
      ),
      with: { profile: true },
    });

    return assignment ?? null;
  }

  async updateSenderAssignment(
    serviceName: string,
    messageType: Template.MessageType,
    region: string,
    updatedSenderProfileId: bigint,
  ): Promise<Configuration.SenderProfileAssignment> {
    const profile = await this.db.query.senderProfiles.findFirst({ where: eq(schema.senderProfiles.id, updatedSenderProfileId) });
    if (!profile) throw new ServerError(AppErrorCode.SND_PRF_001);
    if (!profile.isActive) throw new ServerError(AppErrorCode.SND_ASGN_003);

    const [result] = await this.db
      .update(schema.senderProfileAssignments)
      .set({ senderProfileId: updatedSenderProfileId, updatedAt: new Date() })
      .where(
        and(
          eq(schema.senderProfileAssignments.serviceName, serviceName),
          eq(schema.senderProfileAssignments.messageType, messageType),
          eq(schema.senderProfileAssignments.region, region),
        ),
      )
      .returning();
    if (!result) throw new ServerError(AppErrorCode.SND_ASGN_001);
    return result;
  }

  async deleteSenderAssignment(serviceName: string, messageType: Template.MessageType, region: string): Promise<void> {
    const result = await this.db
      .delete(schema.senderProfileAssignments)
      .where(
        and(
          eq(schema.senderProfileAssignments.serviceName, serviceName),
          eq(schema.senderProfileAssignments.messageType, messageType),
          eq(schema.senderProfileAssignments.region, region),
        ),
      )
      .returning({ serviceName: schema.senderProfileAssignments.serviceName })
      .catch(err => this.datastoreService.translateError(err));
    if (result.length === 0) throw new ServerError(AppErrorCode.SND_ASGN_001);
    this.logger.info(`Deleted sender assignment for service: '${serviceName}', messageType: '${messageType}', region: '${region}'`);
  }
}
