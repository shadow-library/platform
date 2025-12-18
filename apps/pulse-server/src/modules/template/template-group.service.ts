/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { InferInsertModel, asc, desc, eq, like } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { DatastoreService, PrimaryDatabase, Template, schema, templateGroups } from '../datastore';

/**
 * Defining types
 */

export interface ListTemplateQuery extends Partial<OffsetPagination> {
  key?: string;
}

export type CreateTemplateGroup = Omit<InferInsertModel<typeof schema.templateGroups>, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateTemplateGroup = Pick<CreateTemplateGroup, 'isActive' | 'description' | 'priority'>;

/**
 * Declaring the constants
 */

@Injectable()
export class TemplateGroupService {
  private readonly logger = Logger.getLogger(APP_NAME, TemplateGroupService.name);

  private readonly db: PrimaryDatabase;

  constructor(private readonly datastoreService: DatastoreService) {
    this.db = datastoreService.getPrimaryDatabase();
  }

  async createTemplateGroup(data: CreateTemplateGroup): Promise<Template.Group> {
    const [templateGroup] = await this.db
      .insert(schema.templateGroups)
      .values(data)
      .returning()
      .catch(err => this.datastoreService.translateError(err));
    assert(templateGroup, 'Failed to create template group');
    this.logger.info(`Created template group with key: '${templateGroup.templateKey}'`, { templateGroup });
    return templateGroup;
  }

  async listTemplateGroups(filter: ListTemplateQuery = {}): Promise<OffsetPaginationResult<Template.Group>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    const sortField = query.sortBy === 'createdAt' ? schema.templateGroups.createdAt : schema.templateGroups.updatedAt;
    const where = filter.key ? like(schema.templateGroups.templateKey, `%${filter.key}%`) : undefined;
    const [total, items] = await Promise.all([
      this.db.$count(templateGroups, where),
      this.db.query.templateGroups.findMany({ limit: query.limit, offset: query.offset, orderBy: sortOrder(sortField), where }),
    ]);
    return utils.pagination.createResult(query, items, total);
  }

  async getTemplateGroup(templateKeyOrId: string | bigint): Promise<Template.Group | null> {
    const template = await this.db.query.templateGroups.findFirst({
      where: typeof templateKeyOrId === 'bigint' ? eq(schema.templateGroups.id, templateKeyOrId) : eq(schema.templateGroups.templateKey, templateKeyOrId),
    });

    return template ?? null;
  }

  async updateTemplateGroup(id: bigint, update: UpdateTemplateGroup): Promise<Template.Group> {
    const [result] = await this.db.update(schema.templateGroups).set(update).where(eq(schema.templateGroups.id, id)).returning();
    if (!result) throw new ServerError(AppErrorCode.TPL_GRP_001);
    return result;
  }
}
