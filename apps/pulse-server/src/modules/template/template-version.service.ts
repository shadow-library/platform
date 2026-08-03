/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { and, desc, eq, max } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, ValidationError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Notification, PrimaryDatabase, schema, Template } from '@server/database';

import { buildRenderGlobals } from './render-context';
import { type RenderOutput, TemplateEngineService } from './rendering/template-engine.service';
import { DEFAULT_LOCALE, TemplateResolverService } from './template-resolver.service';
import { TemplateService } from './template.service';
import { buildSampleData, parseUndefinedVariable } from './variable-schema.util';

/**
 * Defining types
 */

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

/**
 * Declaring the constants
 */

/**
 * Owns a template's publishing lifecycle: an editable DRAFT is opened (cloned from the current PUBLISHED version),
 * its per-channel content edited, then published — which stamps a monotonic version, promotes the draft to PUBLISHED,
 * and archives the previous one. Every publish is gated by a real sandboxed render against sample data, so a template
 * that references an undeclared variable or a broken partial can never reach live traffic. Rollback re-publishes a copy
 * of any historical version, preserving immutability and the monotonic version sequence.
 */
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
    return this.db.query.templateVersions.findFirst({
      where: and(eq(schema.templateVersions.templateId, templateId), eq(schema.templateVersions.status, 'DRAFT')),
      orderBy: desc(schema.templateVersions.version),
    });
  }

  getPublished(templateId: bigint): Promise<Template.Version | undefined> {
    return this.db.query.templateVersions.findFirst({
      where: and(eq(schema.templateVersions.templateId, templateId), eq(schema.templateVersions.status, 'PUBLISHED')),
    });
  }

  /** Opens the single editable draft, cloning the published version's content so an edit starts from what is live. Rejects if one is already open. */
  async openDraft(templateId: bigint, editedBy?: string): Promise<Template.Version> {
    await this.templateService.getTemplateOrThrow(templateId);
    const existing = await this.getDraft(templateId);
    if (existing) throw AppErrorCode.TPL_PUB_004.create();
    return this.ensureDraft(templateId, editedBy);
  }

  /** Returns the open draft, opening one (cloned from the published version) when none exists. The idempotent get-or-open used when writing content. */
  private async ensureDraft(templateId: bigint, editedBy?: string): Promise<Template.Version> {
    await this.templateService.getTemplateOrThrow(templateId);
    const existing = await this.getDraft(templateId);
    if (existing) return existing;

    const published = await this.getPublished(templateId);
    const draft = await this.db
      .transaction(async tx => {
        const [maxRow] = await tx
          .select({ value: max(schema.templateVersions.version) })
          .from(schema.templateVersions)
          .where(eq(schema.templateVersions.templateId, templateId));
        const nextVersion = (maxRow?.value ?? 0) + 1;
        const [row] = await tx.insert(schema.templateVersions).values({ templateId, version: nextVersion, status: 'DRAFT', editedBy }).returning();
        assert(row, 'Failed to open draft version');
        if (published) {
          const contents = await tx.select().from(schema.templateContents).where(eq(schema.templateContents.templateVersionId, published.id));
          if (contents.length > 0) await tx.insert(schema.templateContents).values(contents.map(content => this.cloneContent(row.id, content)));
        }
        return row;
      })
      .catch(err => this.databaseService.translateError(err));
    assert(draft, 'Failed to open draft version');
    this.logger.info(`Opened draft v${draft.version} for template ${templateId}`);
    return draft;
  }

  /** Writes a per-channel/locale content block onto the draft (auto-opening one), replacing any existing block for that key. */
  async upsertContent(templateId: bigint, data: UpsertContentData, editedBy?: string): Promise<Template.Content> {
    if (data.channel === 'EMAIL' && !data.subject) throw new ValidationError('subject', 'must be provided when the channel is EMAIL');
    const locale = data.locale ?? DEFAULT_LOCALE;
    const draft = await this.ensureDraft(templateId, editedBy);
    const [content] = await this.db
      .insert(schema.templateContents)
      .values({ templateVersionId: draft.id, channel: data.channel, locale, subject: data.subject, body: data.body, layoutKey: data.layoutKey })
      .onConflictDoUpdate({
        target: [schema.templateContents.templateVersionId, schema.templateContents.channel, schema.templateContents.locale],
        set: { subject: data.subject, body: data.body, layoutKey: data.layoutKey, updatedAt: new Date() },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    assert(content, 'Failed to upsert template content');
    await this.db.update(schema.templateVersions).set({ editedBy, updatedAt: new Date() }).where(eq(schema.templateVersions.id, draft.id));
    return content;
  }

  async deleteContent(templateId: bigint, channel: Notification.Channel, locale: string): Promise<void> {
    const draft = await this.getDraft(templateId);
    if (!draft) throw AppErrorCode.TPL_PUB_001.create();
    const deleted = await this.db
      .delete(schema.templateContents)
      .where(and(eq(schema.templateContents.templateVersionId, draft.id), eq(schema.templateContents.channel, channel), eq(schema.templateContents.locale, locale)))
      .returning({ id: schema.templateContents.id });
    if (deleted.length === 0) throw AppErrorCode.TPL_CNT_001.create();
  }

  /** Publishes the draft after a full render gate: draft → PUBLISHED, previous PUBLISHED → ARCHIVED, atomically. */
  async publishDraft(templateId: bigint, options: PublishOptions = {}): Promise<Template.Version> {
    const template = await this.templateService.getTemplateOrThrow(templateId);
    const draft = await this.getDraft(templateId);
    if (!draft) throw AppErrorCode.TPL_PUB_001.create();
    const contents = await this.db.select().from(schema.templateContents).where(eq(schema.templateContents.templateVersionId, draft.id));
    if (contents.length === 0) throw AppErrorCode.TPL_PUB_002.create();
    await this.assertContentsRender(template, contents);

    const published = await this.db.transaction(async tx => {
      await tx
        .update(schema.templateVersions)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(and(eq(schema.templateVersions.templateId, templateId), eq(schema.templateVersions.status, 'PUBLISHED')));
      const [row] = await tx
        .update(schema.templateVersions)
        .set({ status: 'PUBLISHED', publishedAt: new Date(), notes: options.notes ?? draft.notes, editedBy: options.editedBy ?? draft.editedBy, updatedAt: new Date() })
        .where(eq(schema.templateVersions.id, draft.id))
        .returning();
      return row;
    });
    assert(published, 'Failed to publish draft');
    this.logger.info(`Published template ${templateId} as v${published.version}`);
    return published;
  }

  /** Re-publishes a copy of a historical version as a new version — the audit-friendly, immutable form of rollback. */
  async rollback(templateId: bigint, targetVersion: number, options: PublishOptions = {}): Promise<Template.Version> {
    const template = await this.templateService.getTemplateOrThrow(templateId);
    const target = await this.getVersion(templateId, targetVersion);
    if (!target) throw AppErrorCode.TPL_VER_001.create();
    if (target.contents.length === 0) throw AppErrorCode.TPL_PUB_002.create();
    await this.assertContentsRender(template, target.contents);

    const published = await this.db
      .transaction(async tx => {
        const [maxRow] = await tx
          .select({ value: max(schema.templateVersions.version) })
          .from(schema.templateVersions)
          .where(eq(schema.templateVersions.templateId, templateId));
        const nextVersion = (maxRow?.value ?? 0) + 1;
        await tx
          .update(schema.templateVersions)
          .set({ status: 'ARCHIVED', updatedAt: new Date() })
          .where(and(eq(schema.templateVersions.templateId, templateId), eq(schema.templateVersions.status, 'PUBLISHED')));
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
      .catch(err => this.databaseService.translateError(err));
    assert(published, 'Failed to roll back');
    this.logger.info(`Rolled template ${templateId} back to v${targetVersion} (published as v${published.version})`);
    return published;
  }

  /** Renders a single channel/locale of the draft (else the published version) with sample + supplied data — powers the studio preview. */
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

  /** Proves every content block renders under strict, sandboxed Liquid before it goes live; undeclared refs become a publish rejection. */
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

  private cloneContent(templateVersionId: bigint, content: Template.Content): Omit<Template.Content, 'id' | 'createdAt' | 'updatedAt'> {
    return { templateVersionId, channel: content.channel, locale: content.locale, subject: content.subject, body: content.body, layoutKey: content.layoutKey };
  }
}
