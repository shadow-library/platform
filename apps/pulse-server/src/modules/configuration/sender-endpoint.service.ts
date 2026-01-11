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

import { Configuration, DatastoreService, Notification, PrimaryDatabase, schema } from '../datastore';

/**
 * Defining types
 */

export interface ListSenderEndpointsQuery extends Partial<OffsetPagination> {
  channel?: Notification.Channel;
  provider?: Configuration.ServiceProvider;
  isActive?: boolean;
}

export type CreateSenderEndpoint = Omit<InferInsertModel<typeof schema.senderEndpoints>, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateSenderEndpoint = Partial<Pick<CreateSenderEndpoint, 'identifier' | 'weight' | 'isActive'>>;

/**
 * Declaring the constants
 */

@Injectable()
export class SenderEndpointService {
  private readonly logger = Logger.getLogger(APP_NAME, SenderEndpointService.name);

  private readonly db: PrimaryDatabase;

  constructor(private readonly datastoreService: DatastoreService) {
    this.db = datastoreService.getPrimaryDatabase();
  }

  async createSenderEndpoint(profileId: bigint, data: Omit<CreateSenderEndpoint, 'senderProfileId'>): Promise<Configuration.SenderEndpoint> {
    const profile = await this.db.query.senderProfiles.findFirst({ where: eq(schema.senderProfiles.id, profileId) });
    if (!profile) throw new ServerError(AppErrorCode.SND_PRF_001);

    const [senderEndpoint] = await this.db
      .insert(schema.senderEndpoints)
      .values({ ...data, senderProfileId: profileId })
      .returning()
      .catch(err => this.datastoreService.translateError(err));
    assert(senderEndpoint, 'Failed to create sender endpoint');
    this.logger.info(`Created sender endpoint for profile: '${profileId}'`, { senderEndpoint });
    return senderEndpoint;
  }

  async listSenderEndpoints(profileId: bigint, filter: ListSenderEndpointsQuery = {}): Promise<OffsetPaginationResult<Configuration.SenderEndpoint>> {
    const profile = await this.db.query.senderProfiles.findFirst({ where: eq(schema.senderProfiles.id, profileId) });
    if (!profile) throw new ServerError(AppErrorCode.SND_PRF_001);

    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    const sortField = query.sortBy === 'createdAt' ? schema.senderEndpoints.createdAt : schema.senderEndpoints.updatedAt;
    const whereConditions = [eq(schema.senderEndpoints.senderProfileId, profileId)];
    if (filter.channel) whereConditions.push(eq(schema.senderEndpoints.channel, filter.channel));
    if (filter.provider) whereConditions.push(eq(schema.senderEndpoints.provider, filter.provider));
    if (filter.isActive !== undefined) whereConditions.push(eq(schema.senderEndpoints.isActive, filter.isActive));
    const where = and(...whereConditions);
    const [total, items] = await Promise.all([
      this.db.$count(schema.senderEndpoints, where),
      this.db.query.senderEndpoints.findMany({ limit: query.limit, offset: query.offset, orderBy: sortOrder(sortField), where }),
    ]);
    return utils.pagination.createResult(query, items, total);
  }

  async getSenderEndpointsByChannel(profileId: bigint, channel: Notification.Channel): Promise<Configuration.SenderEndpoint[]> {
    const endpoints = await this.db.query.senderEndpoints.findMany({
      where: and(eq(schema.senderEndpoints.senderProfileId, profileId), eq(schema.senderEndpoints.channel, channel), eq(schema.senderEndpoints.isActive, true)),
      orderBy: desc(schema.senderEndpoints.weight),
    });

    return endpoints;
  }

  async getSenderEndpoint(profileId: bigint, endpointId: bigint): Promise<Configuration.SenderEndpoint | null> {
    const endpoint = await this.db.query.senderEndpoints.findFirst({
      where: and(eq(schema.senderEndpoints.id, endpointId), eq(schema.senderEndpoints.senderProfileId, profileId)),
    });

    return endpoint ?? null;
  }

  async updateSenderEndpoint(profileId: bigint, endpointId: bigint, update: UpdateSenderEndpoint): Promise<Configuration.SenderEndpoint> {
    const [result] = await this.db
      .update(schema.senderEndpoints)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(schema.senderEndpoints.id, endpointId), eq(schema.senderEndpoints.senderProfileId, profileId)))
      .returning();
    if (!result) throw new ServerError(AppErrorCode.SND_EP_001);
    return result;
  }

  async deleteSenderEndpoint(profileId: bigint, endpointId: bigint): Promise<void> {
    const result = await this.db
      .delete(schema.senderEndpoints)
      .where(and(eq(schema.senderEndpoints.id, endpointId), eq(schema.senderEndpoints.senderProfileId, profileId)))
      .returning({ id: schema.senderEndpoints.id })
      .catch(err => this.datastoreService.translateError(err));
    if (result.length === 0) throw new ServerError(AppErrorCode.SND_EP_001);
    this.logger.info(`Deleted sender endpoint with id: '${endpointId}' for profile: '${profileId}'`);
  }
}
