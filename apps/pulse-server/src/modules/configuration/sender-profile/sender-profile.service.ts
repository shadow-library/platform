/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { InferInsertModel, and, asc, desc, eq, isNull, like } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Configuration, PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

export interface ListSenderProfilesQuery extends Partial<OffsetPagination> {
  key?: string;
  isActive?: boolean;
}

export type CreateSenderProfile = Omit<InferInsertModel<typeof schema.senderProfiles>, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateSenderProfile = Pick<CreateSenderProfile, 'displayName' | 'isActive'>;

/**
 * Declaring the constants
 */

@Injectable()
export class SenderProfileService {
  private readonly logger = Logger.getLogger(APP_NAME, SenderProfileService.name);

  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async createSenderProfile(data: CreateSenderProfile): Promise<Configuration.SenderProfile> {
    const conditions = [isNull(schema.senderRoutingRules.service), isNull(schema.senderRoutingRules.region), isNull(schema.senderRoutingRules.messageType)];
    const routingRule = await this.db.query.senderRoutingRules.findFirst({ where: and(...conditions) });

    const senderProfile = await this.db
      .transaction(async tx => {
        const [senderProfile] = await tx.insert(schema.senderProfiles).values(data).returning();
        assert(senderProfile, 'Failed to create sender profile');
        if (!routingRule) await tx.insert(schema.senderRoutingRules).values({ senderProfileId: senderProfile.id });
        return senderProfile;
      })
      .catch(err => this.databaseService.translateError(err));
    this.logger.info(`Created sender profile with key: '${senderProfile.key}'`, { senderProfile });
    return senderProfile;
  }

  async listSenderProfiles(filter: ListSenderProfilesQuery = {}): Promise<OffsetPaginationResult<Configuration.SenderProfile>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    const sortField = query.sortBy === 'createdAt' ? schema.senderProfiles.createdAt : schema.senderProfiles.updatedAt;
    const whereConditions = [];
    if (filter.key) whereConditions.push(like(schema.senderProfiles.key, `%${filter.key}%`));
    if (filter.isActive !== undefined) whereConditions.push(eq(schema.senderProfiles.isActive, filter.isActive));
    const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const [total, items] = await Promise.all([
      this.db.$count(schema.senderProfiles, where),
      this.db.query.senderProfiles.findMany({ limit: query.limit, offset: query.offset, orderBy: sortOrder(sortField), where }),
    ]);
    return utils.pagination.createResult(query, items, total);
  }

  async getSenderProfile(profileIdOrKey: string | bigint): Promise<Configuration.SenderProfile | null> {
    const profile = await this.db.query.senderProfiles.findFirst({
      where: typeof profileIdOrKey === 'bigint' ? eq(schema.senderProfiles.id, profileIdOrKey) : eq(schema.senderProfiles.key, profileIdOrKey),
    });

    return profile ?? null;
  }

  async updateSenderProfile(id: bigint, update: UpdateSenderProfile): Promise<Configuration.SenderProfile> {
    const [result] = await this.db
      .update(schema.senderProfiles)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.senderProfiles.id, id))
      .returning();
    if (!result) throw new ServerError(AppErrorCode.SND_PRF_001);
    return result;
  }

  async deleteSenderProfile(id: bigint): Promise<void> {
    const result = await this.db
      .delete(schema.senderProfiles)
      .where(eq(schema.senderProfiles.id, id))
      .returning({ id: schema.senderProfiles.id })
      .catch(err => this.databaseService.translateError(err));
    if (result.length === 0) throw new ServerError(AppErrorCode.SND_PRF_001);
    this.logger.info(`Deleted sender profile with id: '${id}'`);
  }
}
