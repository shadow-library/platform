/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPagination, OffsetPaginationResult, ValidationError, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService, LinkedWithParent } from '@shadow-library/modules';
import { InferInsertModel, and, asc, desc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { Notification, PrimaryDatabase, Template, schema } from '@modules/database';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

export type CreateTemplateVariant = Omit<InferInsertModel<typeof schema.templateVariants>, 'id' | 'templateGroupId' | 'createdAt' | 'updatedAt'>;

export interface ListVariantQuery extends Partial<OffsetPagination<'updatedAt' | 'createdAt'>> {
  channel?: Notification.Channel;
  locale?: string;
}

export type LinkedTemplateVariant = LinkedWithParent<Template.Variant, Template.Group>;

/**
 * Declaring the constants
 */

@Injectable()
export class TemplateVariantService {
  private readonly logger = Logger.getLogger(APP_NAME, TemplateVariantService.name);

  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async getTemplateVariantById(templateGroupId: bigint, templateVariantId: bigint): Promise<Template.Variant | null> {
    const templateVariant = await this.db.query.templateVariants.findFirst({
      where: and(eq(schema.templateVariants.templateGroupId, templateGroupId), eq(schema.templateVariants.id, templateVariantId)),
    });
    return templateVariant ?? null;
  }

  async getTemplateVariantByKey(templateKey: string, channel: Notification.Channel, locale: string): Promise<LinkedTemplateVariant | null> {
    const templateGroup = await this.db.query.templateGroups.findFirst({
      where: eq(schema.templateGroups.templateKey, templateKey),
      with: {
        variants: {
          where: and(eq(schema.templateVariants.channel, channel), eq(schema.templateVariants.locale, locale)),
          limit: 1,
        },
      },
    });

    const variant = templateGroup?.variants[0];
    return variant ? this.databaseService.attachParent(variant, templateGroup) : null;
  }

  async getTemplateVariant(templateGroupId: bigint, channel: Notification.Channel, locale: string): Promise<LinkedTemplateVariant | null> {
    const templateGroup = await this.db.query.templateGroups.findFirst({
      where: eq(schema.templateGroups.id, templateGroupId),
      with: {
        variants: {
          where: and(eq(schema.templateVariants.channel, channel), eq(schema.templateVariants.locale, locale)),
          limit: 1,
        },
      },
    });

    const variant = templateGroup?.variants[0];
    return variant ? this.databaseService.attachParent(variant, templateGroup) : null;
  }

  async listTemplateVariants(templateGroupId: bigint, filter: ListVariantQuery = {}): Promise<OffsetPaginationResult<Template.Variant>> {
    const page = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const templateGroup = await this.db.query.templateGroups.findFirst({ where: eq(schema.templateGroups.id, templateGroupId) });
    if (!templateGroup) throw new ServerError(AppErrorCode.TPL_GRP_001);

    const sortField = page.sortBy === 'createdAt' ? schema.templateVariants.createdAt : schema.templateVariants.updatedAt;
    const orderBy = page.sortOrder === 'asc' ? asc(sortField) : desc(sortField);
    const whereConditions = [eq(schema.templateVariants.templateGroupId, templateGroupId)];
    if (filter.channel) whereConditions.push(eq(schema.templateVariants.channel, filter.channel));
    if (filter.locale) whereConditions.push(eq(schema.templateVariants.locale, filter.locale));
    const where = and(...whereConditions);

    const [total, items] = await Promise.all([
      this.db.$count(schema.templateVariants, where),
      this.db.query.templateVariants.findMany({ offset: page.offset, limit: page.limit, orderBy, where }),
    ]);

    return utils.pagination.createResult(page, items, total);
  }

  async addTemplateVariant(templateGroupId: bigint, data: CreateTemplateVariant): Promise<Template.Variant> {
    if (data.channel === 'EMAIL' && !data.subject) throw new ValidationError('subject', 'must be provided when the channel is EMAIL');
    const templateVariant = await this.db
      .transaction(async tx => {
        const [templateVariant] = await tx
          .insert(schema.templateVariants)
          .values({ ...data, templateGroupId })
          .returning();
        await tx.insert(schema.templateChannelSettings).values({ templateGroupId, channel: data.channel, isEnabled: true }).onConflictDoNothing();
        return templateVariant;
      })
      .catch(err => this.databaseService.translateError(err));

    assert(templateVariant, 'Failed to create template variant');
    this.logger.info('Template variant created', { channel: templateVariant.channel, locale: templateVariant.locale, templateGroupId });
    return templateVariant;
  }

  async updateTemplateVariant(templateGroupId: bigint, templateVariantId: bigint, update: Partial<CreateTemplateVariant>): Promise<Template.Variant> {
    if (Object.keys(update).length === 0) throw new ValidationError('update', 'must contain at least one field');
    const [templateVariant] = await this.db
      .update(schema.templateVariants)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(schema.templateVariants.templateGroupId, templateGroupId), eq(schema.templateVariants.id, templateVariantId)))
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!templateVariant) throw new ServerError(AppErrorCode.TPL_VRT_001);
    this.logger.info('Template variant updated', { channel: templateVariant.channel, locale: templateVariant.locale, templateGroupId });
    return templateVariant;
  }

  async deleteTemplateVariant(templateGroupId: bigint, templateVariantId: bigint): Promise<void> {
    const result = await this.db
      .delete(schema.templateVariants)
      .where(and(eq(schema.templateVariants.templateGroupId, templateGroupId), eq(schema.templateVariants.id, templateVariantId)))
      .returning({ id: schema.templateVariants.id })
      .catch(err => this.databaseService.translateError(err));
    if (result.length === 0) throw new ServerError(AppErrorCode.TPL_VRT_001);
    this.logger.info('Template variant deleted', { templateVariantId, templateGroupId, result });
  }
}
