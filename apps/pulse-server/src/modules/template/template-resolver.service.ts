import { and, asc, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { InMemoryStore, Logger, LRUCache } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Notification, PrimaryDatabase, schema, Template } from '@server/database';

export interface ResolvedTemplate {
  template: Template.Template;
  publishedVersion: Template.Version | null;
  enabledChannels: Notification.Channel[];
}

export interface RenderBundle {
  subject: string | null;
  body: string;
  layout: string | null;
  partials: Record<string, string>;
}

/** Every template must have en-ZZ content, so it is the universal fallback. */
export const DEFAULT_LOCALE = 'en-ZZ';

const CONTENT_CACHE_CAPACITY = 2000;
const LAYOUT_CACHE_CAPACITY = 200;
const PARTIALS_STORE_KEY = 'published-partials';

/** The caller pins `publishedVersion.id` onto the job so a retry re-renders identical content after a re-edit; layout and partials are always the currently published ones. */
@Injectable()
export class TemplateResolverService {
  private readonly logger = Logger.getLogger(APP_NAME, TemplateResolverService.name);
  private readonly db: PrimaryDatabase;

  /** Safe to cache indefinitely: published content is immutable per version id. */
  private readonly contentCache = new LRUCache(CONTENT_CACHE_CAPACITY);
  /** Cleared on layout publish in this process only. */
  private readonly layoutCache = new LRUCache(LAYOUT_CACHE_CAPACITY);
  /** Dropped on partial publish in this process only. */
  private readonly partialStore = new InMemoryStore();

  constructor(private readonly databaseService: DatabaseService) {
    this.db = this.databaseService.getPostgresClient();
  }

  async resolveForSend(templateKey: string): Promise<ResolvedTemplate> {
    const template = await this.db.query.templates.findFirst({
      where: eq(schema.templates.templateKey, templateKey),
      with: {
        channelSettings: { where: eq(schema.templateChannelSettings.isEnabled, true), orderBy: asc(schema.templateChannelSettings.channel) },
        versions: { where: eq(schema.templateVersions.status, 'PUBLISHED'), limit: 1 },
      },
    });
    if (!template) return this.notFound(templateKey);

    const publishedVersion = template.versions[0] ?? null;
    const enabledChannels = template.isActive ? template.channelSettings.map(setting => setting.channel) : [];
    return { template, publishedVersion, enabledChannels };
  }

  async findContent(versionId: bigint, channel: Notification.Channel, locale: string): Promise<Template.Content | null> {
    const cacheKey = `${versionId}:${channel}:${locale}`;
    if (this.contentCache.has(cacheKey)) return this.contentCache.get<Template.Content | null>(cacheKey) ?? null;

    let content = await this.queryContent(versionId, channel, locale);
    if (!content && locale !== DEFAULT_LOCALE) content = await this.queryContent(versionId, channel, DEFAULT_LOCALE);

    this.contentCache.set(cacheKey, content ?? null);
    return content ?? null;
  }

  async loadRenderBundle(versionId: bigint, channel: Notification.Channel, locale: string): Promise<RenderBundle | null> {
    const content = await this.findContent(versionId, channel, locale);
    if (!content) return null;

    const layout = channel === 'EMAIL' && content.layoutKey ? await this.publishedLayoutBody(content.layoutKey) : null;
    const partials = await this.publishedPartials();
    return { subject: content.subject, body: content.body, layout, partials };
  }

  async publishedLayoutBody(layoutKey: string): Promise<string | null> {
    if (this.layoutCache.has(layoutKey)) return this.layoutCache.get<string | null>(layoutKey) ?? null;

    const layout = await this.db.query.layouts.findFirst({
      where: eq(schema.layouts.layoutKey, layoutKey),
      with: { versions: { where: eq(schema.layoutVersions.status, 'PUBLISHED'), limit: 1 } },
    });
    const body = layout?.versions[0]?.body ?? null;
    this.layoutCache.set(layoutKey, body);
    return body;
  }

  async publishedPartials(): Promise<Record<string, string>> {
    const cached = this.partialStore.get<Record<string, string>>(PARTIALS_STORE_KEY);
    if (cached) return cached;

    const rows = await this.db.query.partials.findMany({
      with: { versions: { where: eq(schema.partialVersions.status, 'PUBLISHED'), limit: 1 } },
    });
    const map: Record<string, string> = {};
    for (const partial of rows) {
      const body = partial.versions[0]?.body;
      if (body != null) map[partial.partialKey] = body;
    }
    this.partialStore.set(PARTIALS_STORE_KEY, map);
    return map;
  }

  invalidateLayouts(): void {
    this.layoutCache.clear();
  }

  invalidatePartials(): void {
    this.partialStore.del(PARTIALS_STORE_KEY);
  }

  private queryContent(versionId: bigint, channel: Notification.Channel, locale: string): Promise<Template.Content | undefined> {
    return this.db.query.templateContents.findFirst({
      where: and(eq(schema.templateContents.templateVersionId, versionId), eq(schema.templateContents.channel, channel), eq(schema.templateContents.locale, locale)),
      orderBy: desc(schema.templateContents.id),
    });
  }

  private notFound(templateKey: string): never {
    this.logger.debug(`Template not found for key '${templateKey}'`);
    throw AppErrorCode.TPL_001.create();
  }
}
