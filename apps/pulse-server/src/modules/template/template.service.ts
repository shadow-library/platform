/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { and, asc, desc, eq, InferInsertModel, like } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Notification, PrimaryDatabase, schema, Template } from '@server/database';

/**
 * Defining types
 */

export interface ListTemplateQuery extends Partial<OffsetPagination> {
  key?: string;
  messageType?: Template.MessageType;
}

export type CreateTemplate = Omit<InferInsertModel<typeof schema.templates>, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateTemplate = Partial<Pick<CreateTemplate, 'name' | 'description' | 'messageType' | 'priority' | 'category' | 'variableSchema' | 'isActive'>>;

/**
 * Declaring the constants
 */

/**
 * The template aggregate root — the stable identity addressed by `templateKey`. Owns template metadata, the variable
 * contract, and per-channel enablement. Renderable content lives in immutable versions ({@link TemplateVersionService});
 * live-send resolution lives in {@link TemplateResolverService}.
 */
@Injectable()
export class TemplateService {
  private readonly logger = Logger.getLogger(APP_NAME, TemplateService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = this.databaseService.getPostgresClient();
  }

  async createTemplate(data: CreateTemplate): Promise<Template.Template> {
    const [template] = await this.db
      .insert(schema.templates)
      .values(data)
      .returning()
      .catch(err => this.databaseService.translateError(err));
    assert(template, 'Failed to create template');
    this.logger.info(`Created template '${template.templateKey}'`, { templateId: template.id });
    return template;
  }

  async listTemplates(filter: ListTemplateQuery = {}): Promise<OffsetPaginationResult<Template.Template>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    const sortField = query.sortBy === 'createdAt' ? schema.templates.createdAt : schema.templates.updatedAt;
    const conditions = [];
    if (filter.messageType) conditions.push(eq(schema.templates.messageType, filter.messageType));
    if (filter.key) conditions.push(like(schema.templates.templateKey, `%${filter.key}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [total, items] = await Promise.all([
      this.db.$count(schema.templates, where),
      this.db.query.templates.findMany({ limit: query.limit, offset: query.offset, orderBy: sortOrder(sortField), where }),
    ]);
    return utils.pagination.createResult(query, items, total);
  }

  async getTemplate(idOrKey: bigint | string): Promise<Template.Template | null> {
    const template = await this.db.query.templates.findFirst({
      where: typeof idOrKey === 'bigint' ? eq(schema.templates.id, idOrKey) : eq(schema.templates.templateKey, idOrKey),
    });
    return template ?? null;
  }

  async getTemplateOrThrow(idOrKey: bigint | string): Promise<Template.Template> {
    const template = await this.getTemplate(idOrKey);
    if (!template) throw AppErrorCode.TPL_001.create();
    return template;
  }

  async updateTemplate(id: bigint, update: UpdateTemplate): Promise<Template.Template> {
    const [template] = await this.db
      .update(schema.templates)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.templates.id, id))
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!template) throw AppErrorCode.TPL_001.create();
    this.logger.info(`Updated template '${template.templateKey}'`, { templateId: template.id });
    return template;
  }

  async listChannelSettings(templateId: bigint): Promise<Template.ChannelSetting[]> {
    return this.db.query.templateChannelSettings.findMany({ where: eq(schema.templateChannelSettings.templateId, templateId) });
  }

  /** Upserts a channel's enablement; creating a setting for the first time enables the channel in the send fan-out. */
  async setChannelSetting(templateId: bigint, channel: Notification.Channel, isEnabled: boolean): Promise<Template.ChannelSetting> {
    await this.getTemplateOrThrow(templateId);
    const [setting] = await this.db
      .insert(schema.templateChannelSettings)
      .values({ templateId, channel, isEnabled })
      .onConflictDoUpdate({
        target: [schema.templateChannelSettings.templateId, schema.templateChannelSettings.channel],
        set: { isEnabled, updatedAt: new Date() },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    assert(setting, 'Failed to upsert channel setting');
    this.logger.info(`Set channel '${channel}' enabled=${isEnabled} on template ${templateId}`);
    return setting;
  }
}
