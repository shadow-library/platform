/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { InferInsertModel, asc, desc, eq, like } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { DatastoreService, PrimaryDatabase, Template, schema } from '../datastore';

/**
 * Defining types
 */

export interface ListTemplateQuery {
  key?: string;
}

export interface Pagination {
  offset?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TemplateDetails extends Template.Group {
  variants: Template.Variant[];
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

  async listTemplateGroups(filter: ListTemplateQuery = {}, pagination: Pagination = {}): Promise<Template.Group[]> {
    const limit = pagination.limit ?? 20;
    const offset = pagination.offset ?? 0;
    const sortOrder = pagination.sortOrder === 'asc' ? asc : desc;
    const sortField = pagination.sortBy === 'createdAt' ? schema.templateGroups.createdAt : schema.templateGroups.updatedAt;
    const where = filter.key ? like(schema.templateGroups.templateKey, `%${filter.key}%`) : undefined;
    return await this.db.query.templateGroups.findMany({ limit, offset, orderBy: sortOrder(sortField), where });
  }

  async getTemplateGroup(id: bigint): Promise<TemplateDetails | null> {
    const template = await this.db.query.templateGroups.findFirst({
      where: eq(schema.templateGroups.id, id),
      with: { variants: true },
    });

    return template ?? null;
  }

  async updateTemplateGroup(id: bigint, update: UpdateTemplateGroup): Promise<Template.Group> {
    const [result] = await this.db.update(schema.templateGroups).set(update).where(eq(schema.templateGroups.id, id)).returning();
    if (!result) throw new ServerError(AppErrorCode.TPL_GRP_001);
    return result;
  }
}
