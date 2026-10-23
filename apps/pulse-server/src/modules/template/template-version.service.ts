import assert from 'node:assert';

import { and, asc, desc, eq, max } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, ValidationError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Notification, PrimaryDatabase, type PrimaryTransaction, schema, Template } from '@server/database';

import { buildRenderGlobals } from './render-context';
import { type RenderOutput, TemplateEngineService } from './rendering/template-engine.service';
import { DEFAULT_LOCALE, TemplateResolverService } from './template-resolver.service';
import { TemplateService } from './template.service';
import { buildSampleData, parseUndefinedVariable } from './variable-schema.util';
import { lockVersionedParent, rethrowTransactionError } from './version-transaction.util';

export type VersionWithContents = Template.Version & { contents: Template.Content[] };

export interface UpsertContentData {
  channel: Notification.Channel;
  locale?: string;
  subject?: string | null;
  body: string;
  layoutKey?: string | null;
}

export interface PublishOptions {
  notes?: string;
  editedBy?: string;
}

export interface PreviewInput {
  channel: Notification.Channel;
  locale?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class TemplateVersionService {
  private readonly logger = Logger.getLogger(APP_NAME, TemplateVersionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly templateService: TemplateService,
    private readonly resolver: TemplateResolverService,
    private readonly engine: TemplateEngineService,
  ) {
    this.db = this.databaseService.getPostgresClient();
  }

  async listVersions(templateId: bigint): Promise<Template.Version[]> {
    await this.templateService.getTemplateOrThrow(templateId);
    return this.db.query.templateVersions.findMany({ where: eq(schema.templateVersions.templateId, templateId), orderBy: desc(schema.templateVersions.version) });
  }

  async getVersion(templateId: bigint, version: number): Promise<VersionWithContents | null> {
    const row = await this.db.query.templateVersions.findFirst({
      where: and(eq(schema.templateVersions.templateId, templateId), eq(schema.templateVersions.version, version)),
      with: { contents: true },
    });
    return row ?? null;
  }

  getDraft(templateId: bigint): Promise<Template.Version | undefined> {
    return this.findVersion(this.db, templateId, 'DRAFT');
  }

  getPublished(templateId: bigint): Promise<Template.Version | undefined> {
    return this.findVersion(this.db, templateId, 'PUBLISHED');
  }

  async openDraft(templateId: bigint, editedBy?: string): Promise<Template.Version> {
    return this.db
      .transaction(async tx => {
        await this.lockTemplate(tx, templateId);
        if (await this.findVersion(tx, templateId, 'DRAFT')) throw AppErrorCode.TPL_PUB_004.create();
        return this.createDraft(tx, templateId, editedBy);
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
  }

  async upsertContent(templateId: bigint, data: UpsertContentData, editedBy?: string): Promise<Template.Content> {
    if (data.channel === 'EMAIL' && !data.subject) throw new ValidationError('subject', 'must be provided when the channel is EMAIL');
    const locale = data.locale ?? DEFAULT_LOCALE;
    return this.db
      .transaction(async tx => {
        await this.lockTemplate(tx, templateId);
        const draft = (await this.findVersion(tx, templateId, 'DRAFT')) ?? (await this.createDraft(tx, templateId, editedBy));
        const [content] = await tx
          .insert(schema.templateContents)
          .values({ templateVersionId: draft.id, channel: data.channel, locale, subject: data.subject, body: data.body, layoutKey: data.layoutKey })
          .onConflictDoUpdate({
            target: [schema.templateContents.templateVersionId, schema.templateContents.channel, schema.templateContents.locale],
            set: { subject: data.subject, body: data.body, layoutKey: data.layoutKey, updatedAt: new Date() },
          })
          .returning();
        assert(content, 'Failed to upsert template content');
        await tx.update(schema.templateVersions).set({ editedBy, updatedAt: new Date() }).where(eq(schema.templateVersions.id, draft.id));
        return content;
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
  }

  async deleteContent(templateId: bigint, channel: Notification.Channel, locale: string): Promise<void> {
    await this.db
      .transaction(async tx => {
        await this.lockTemplate(tx, templateId);
        const draft = await this.findVersion(tx, templateId, 'DRAFT');
        if (!draft) throw AppErrorCode.TPL_PUB_001.create();
        const deleted = await tx
          .delete(schema.templateContents)
          .where(and(eq(schema.templateContents.templateVersionId, draft.id), eq(schema.templateContents.channel, channel), eq(schema.templateContents.locale, locale)))
          .returning({ id: schema.templateContents.id });
        if (deleted.length === 0) throw AppErrorCode.TPL_CNT_001.create();
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
  }

  async publishDraft(templateId: bigint, options: PublishOptions = {}): Promise<Template.Version> {
    const template = await this.templateService.getTemplateOrThrow(templateId);
    const draft = await this.getDraft(templateId);
    if (!draft) throw AppErrorCode.TPL_PUB_001.create();
    const contents = await this.loadContents(this.db, draft.id);
    if (contents.length === 0) throw AppErrorCode.TPL_PUB_002.create();
    await this.assertContentsRender(template, contents);

    const published = await this.db
      .transaction(async tx => {
        await this.lockTemplate(tx, templateId);
        const current = await this.findVersion(tx, templateId, 'DRAFT');
        if (!current) throw AppErrorCode.TPL_PUB_001.create();
        if (current.id !== draft.id || !isSameContents(contents, await this.loadContents(tx, current.id))) throw AppErrorCode.TPL_PUB_005.create();
        await this.archivePublished(tx, templateId);
        const [row] = await tx
          .update(schema.templateVersions)
          .set({ status: 'PUBLISHED', publishedAt: new Date(), notes: options.notes ?? current.notes, editedBy: options.editedBy ?? current.editedBy, updatedAt: new Date() })
          .where(eq(schema.templateVersions.id, current.id))
          .returning();
        assert(row, 'Failed to publish draft');
        return row;
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
    this.logger.info(`Published template ${templateId} as v${published.version}`);
    return published;
  }

  /** Rollback publishes a copy of a historical version, so versions stay immutable and monotonic. */
  async rollback(templateId: bigint, targetVersion: number, options: PublishOptions = {}): Promise<Template.Version> {
    const template = await this.templateService.getTemplateOrThrow(templateId);
    const target = await this.getVersion(templateId, targetVersion);
    if (!target) throw AppErrorCode.TPL_VER_001.create();
    if (target.contents.length === 0) throw AppErrorCode.TPL_PUB_002.create();
    await this.assertContentsRender(template, target.contents);

    const published = await this.db
      .transaction(async tx => {
        await this.lockTemplate(tx, templateId);
        const nextVersion = await this.nextVersion(tx, templateId);
        await this.archivePublished(tx, templateId);
        const [row] = await tx
          .insert(schema.templateVersions)
          .values({
            templateId,
            version: nextVersion,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            notes: options.notes ?? `Rollback to v${targetVersion}`,
            editedBy: options.editedBy,
          })
          .returning();
        assert(row, 'Failed to create rollback version');
        await tx.insert(schema.templateContents).values(target.contents.map(content => this.cloneContent(row.id, content)));
        return row;
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
    this.logger.info(`Rolled template ${templateId} back to v${targetVersion} (published as v${published.version})`);
    return published;
  }

  async preview(templateId: bigint, input: PreviewInput): Promise<RenderOutput> {
    const template = await this.templateService.getTemplateOrThrow(templateId);
    const version = (await this.getDraft(templateId)) ?? (await this.getPublished(templateId));
    if (!version) throw AppErrorCode.TPL_VER_003.create();
    const content = await this.queryContentWithFallback(version.id, input.channel, input.locale ?? DEFAULT_LOCALE);
    if (!content) throw AppErrorCode.TPL_CNT_001.create();

    const data = { ...buildRenderGlobals(), ...buildSampleData(template.variableSchema), ...(input.data ?? {}) };
    const partials = await this.resolver.publishedPartials();
    const layout = input.channel === 'EMAIL' && content.layoutKey ? await this.resolver.publishedLayoutBody(content.layoutKey) : null;
    return this.engine.render({ channel: input.channel, subject: content.subject, body: content.body, layout, partials, data });
  }

  private async assertContentsRender(template: Template.Template, contents: Template.Content[]): Promise<void> {
    const data = { ...buildRenderGlobals(), ...buildSampleData(template.variableSchema) };
    const partials = await this.resolver.publishedPartials();
    for (const content of contents) {
      const layout = content.channel === 'EMAIL' && content.layoutKey ? await this.resolver.publishedLayoutBody(content.layoutKey) : null;
      try {
        await this.engine.render({ channel: content.channel, subject: content.subject, body: content.body, layout, partials, data });
      } catch (error) {
        const variable = parseUndefinedVariable(error);
        this.logger.warn(`Publish validation failed for template ${template.id} (${content.channel}/${content.locale})`, { error });
        throw AppErrorCode.TPL_PUB_003.create({ variable: variable ?? 'unknown', channel: content.channel, locale: content.locale });
      }
    }
  }

  private async queryContentWithFallback(versionId: bigint, channel: Notification.Channel, locale: string): Promise<Template.Content | null> {
    const direct = await this.db.query.templateContents.findFirst({
      where: and(eq(schema.templateContents.templateVersionId, versionId), eq(schema.templateContents.channel, channel), eq(schema.templateContents.locale, locale)),
    });
    if (direct) return direct;
    if (locale === DEFAULT_LOCALE) return null;
    const fallback = await this.db.query.templateContents.findFirst({
      where: and(eq(schema.templateContents.templateVersionId, versionId), eq(schema.templateContents.channel, channel), eq(schema.templateContents.locale, DEFAULT_LOCALE)),
    });
    return fallback ?? null;
  }

  private async lockTemplate(tx: PrimaryTransaction, templateId: bigint): Promise<void> {
    if (!(await lockVersionedParent(tx, schema.templates, templateId))) throw AppErrorCode.TPL_001.create();
  }

  private findVersion(executor: PrimaryDatabase | PrimaryTransaction, templateId: bigint, status: 'DRAFT' | 'PUBLISHED'): Promise<Template.Version | undefined> {
    return executor.query.templateVersions.findFirst({
      where: and(eq(schema.templateVersions.templateId, templateId), eq(schema.templateVersions.status, status)),
      orderBy: desc(schema.templateVersions.version),
    });
  }

  private loadContents(executor: PrimaryDatabase | PrimaryTransaction, versionId: bigint): Promise<Template.Content[]> {
    return executor.select().from(schema.templateContents).where(eq(schema.templateContents.templateVersionId, versionId)).orderBy(asc(schema.templateContents.id));
  }

  private async nextVersion(tx: PrimaryTransaction, templateId: bigint): Promise<number> {
    const [maxRow] = await tx
      .select({ value: max(schema.templateVersions.version) })
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.templateId, templateId));
    return (maxRow?.value ?? 0) + 1;
  }

  private async archivePublished(tx: PrimaryTransaction, templateId: bigint): Promise<void> {
    await tx
      .update(schema.templateVersions)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(and(eq(schema.templateVersions.templateId, templateId), eq(schema.templateVersions.status, 'PUBLISHED')));
  }

  private async createDraft(tx: PrimaryTransaction, templateId: bigint, editedBy?: string): Promise<Template.Version> {
    const [draft] = await tx
      .insert(schema.templateVersions)
      .values({ templateId, version: await this.nextVersion(tx, templateId), status: 'DRAFT', editedBy })
      .returning();
    assert(draft, 'Failed to open draft version');
    const published = await this.findVersion(tx, templateId, 'PUBLISHED');
    const contents = published ? await this.loadContents(tx, published.id) : [];
    if (contents.length > 0) await tx.insert(schema.templateContents).values(contents.map(content => this.cloneContent(draft.id, content)));
    this.logger.info(`Opened draft v${draft.version} for template ${templateId}`);
    return draft;
  }

  private cloneContent(templateVersionId: bigint, content: Template.Content): Omit<Template.Content, 'id' | 'createdAt' | 'updatedAt'> {
    return { templateVersionId, channel: content.channel, locale: content.locale, subject: content.subject, body: content.body, layoutKey: content.layoutKey };
  }
}

function isSameContents(gated: Template.Content[], current: Template.Content[]): boolean {
  const fingerprint = (contents: Template.Content[]): string =>
    JSON.stringify(contents.map(content => [String(content.id), content.channel, content.locale, content.subject, content.body, content.layoutKey]));
  return fingerprint(gated) === fingerprint(current);
}
