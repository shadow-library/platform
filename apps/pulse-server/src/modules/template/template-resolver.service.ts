/**
 * Importing npm packages
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { InMemoryStore, Logger, LRUCache } from '@shadow-library/common';
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

export interface ResolvedTemplate {
  template: Template.Template;
  /** The single PUBLISHED version, or null when the template has never been published. */
  publishedVersion: Template.Version | null;
  /** Channels the template fans out to — enabled settings on an active template; empty for an inactive template. */
  enabledChannels: Notification.Channel[];
}

export interface RenderBundle {
  subject: string | null;
  body: string;
  /** The published layout shell (EMAIL only), or null to deliver the fragment unwrapped. */
  layout: string | null;
  /** Every published partial, keyed by partialKey, available to `{% render %}`. */
  partials: Record<string, string>;
}

/**
 * Declaring the constants
 */
/** The neutral, language-agnostic base locale; every template must have en-ZZ content, so it is the universal fallback. */
export const DEFAULT_LOCALE = 'en-ZZ';

/** Bounds on the immutable per-version content and per-key layout caches, so a long-lived worker can never grow unboundedly. */
const CONTENT_CACHE_CAPACITY = 2000;
const LAYOUT_CACHE_CAPACITY = 200;
/** Single-entry key under which the full published-partial set is memoised. */
const PARTIALS_STORE_KEY = 'published-partials';

/**
 * Resolves the renderable artifacts for a send. Two responsibilities:
 *
 *  1. **Send-time resolution** ({@link resolveForSend}) — the stable published version + enabled channels a producer
 *     addresses by `templateKey`. The caller pins the returned `publishedVersion.id` onto the job so a retry re-renders
 *     byte-identical content even after the template is re-edited.
 *  2. **Render-bundle assembly** ({@link loadRenderBundle}) — the immutable content of a pinned version composed with the
 *     *currently* published design system (layout + partials). Published content is immutable per version id, so it is
 *     cached indefinitely; the design system can be re-published, so its caches are invalidated on publish.
 */
@Injectable()
export class TemplateResolverService {
  private readonly logger = Logger.getLogger(APP_NAME, TemplateResolverService.name);
  private readonly db: PrimaryDatabase;

  /** Keyed by `${versionId}:${channel}:${requestedLocale}` → resolved content (or null). Safe forever: version ids are immutable, so a bounded LRU only ever evicts cold entries. */
  private readonly contentCache = new LRUCache(CONTENT_CACHE_CAPACITY);
  /** Keyed by layoutKey → published body (or null). Cleared when any layout is (re)published. */
  private readonly layoutCache = new LRUCache(LAYOUT_CACHE_CAPACITY);
  /** Holds the full published-partial set under a single key; dropped when any partial is (re)published. */
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

  /** Resolves the content row for a pinned version + channel, honouring the en-ZZ locale fallback. Cached (immutable). */
  async findContent(versionId: bigint, channel: Notification.Channel, locale: string): Promise<Template.Content | null> {
    const cacheKey = `${versionId}:${channel}:${locale}`;
    if (this.contentCache.has(cacheKey)) return this.contentCache.get<Template.Content | null>(cacheKey) ?? null;

    let content = await this.queryContent(versionId, channel, locale);
    if (!content && locale !== DEFAULT_LOCALE) content = await this.queryContent(versionId, channel, DEFAULT_LOCALE);

    this.contentCache.set(cacheKey, content ?? null);
    return content ?? null;
  }

  /** Assembles the full render bundle for a pinned version: immutable content + the currently published design system. */
  async loadRenderBundle(versionId: bigint, channel: Notification.Channel, locale: string): Promise<RenderBundle | null> {
    const content = await this.findContent(versionId, channel, locale);
    if (!content) return null;

    const layout = channel === 'EMAIL' && content.layoutKey ? await this.publishedLayoutBody(content.layoutKey) : null;
    const partials = await this.publishedPartials();
    return { subject: content.subject, body: content.body, layout, partials };
  }

  /** The published body of a layout, or null if the layout is unknown or has no published version. Cached until a layout publish. */
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

  /** Every published partial keyed by partialKey. Cached as a set until a partial publish. */
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

  /** Called by the layout service after a publish — the next render picks up the new design-system shell. */
  invalidateLayouts(): void {
    this.layoutCache.clear();
  }

  /** Called by the partial service after a publish — the next render picks up the new partial set. */
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
