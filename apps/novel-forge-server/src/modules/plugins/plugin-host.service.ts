import { and, asc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { type LoadedPlugin, loadPlugins, validateManifest } from './plugin-loader';
import { type ForgePlugin, type PluginHostApi, type ScopedPluginHost } from './plugin.types';

export const MAX_KV_KEY_LENGTH = 128;
export const MAX_KV_VALUE_BYTES = 256 * 1024;

/** Raised by `host.kv` writes a plugin is not allowed to make. Plugin-facing, so it never reaches HTTP on its own. */
export class PluginStorageError extends Error {}

export function createPluginLogger(pluginId: string): ScopedPluginHost['log'] {
  const logger = Logger.getLogger(APP_NAME, `plugin:${pluginId}`);
  return {
    debug: (msg, meta) => logger.debug(msg, meta),
    info: (msg, meta) => logger.info(msg, meta),
    warn: (msg, meta) => logger.warn(msg, meta),
    error: (msg, meta) => logger.error(msg, meta),
  };
}

@Injectable()
export class PluginHost {
  private readonly logger = Logger.getLogger(APP_NAME, PluginHost.name);
  private readonly plugins = new Map<string, LoadedPlugin>();

  async onModuleInit(): Promise<void> {
    const dir = Config.get('plugins.dir');
    if (!dir) return;

    const loaded = await loadPlugins(dir, id => this.createHost(id));
    for (const entry of loaded) this.plugins.set(entry.id, entry);
    this.logger.info('plugins loaded', { dir, ids: loaded.map(entry => entry.id) });
  }

  list(): LoadedPlugin[] {
    return [...this.plugins.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  /** The in-memory seam the suite registers fixtures through; every other caller goes through `plugins.dir`. */
  registerForTest(plugin: ForgePlugin): void {
    this.plugins.set(plugin.id, { id: plugin.id, manifest: validateManifest(plugin.manifest(), plugin.id), plugin });
  }

  private createHost(pluginId: string): PluginHostApi {
    return { log: createPluginLogger(pluginId) };
  }
}

/** `projectId` is captured here and never appears in the plugin-facing API, so a plugin cannot address another novel even by mistake. */
@Injectable()
export class ScopedPluginHostFactory {
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  create(pluginId: string, projectId: bigint): ScopedPluginHost {
    return {
      log: createPluginLogger(pluginId),
      kv: {
        get: key => this.kvGet(projectId, pluginId, key),
        set: (key, value) => this.kvSet(projectId, pluginId, key, value),
        delete: key => this.kvDelete(projectId, pluginId, key),
      },
      read: {
        brief: chapter => this.readBrief(projectId, chapter),
        draft: chapter => this.readDraft(projectId, chapter),
        entities: () => this.readEntities(projectId),
        facts: () => this.readFacts(projectId),
      },
    };
  }

  private async kvGet(projectId: bigint, pluginId: string, key: string): Promise<unknown> {
    const row = await this.db.query.pluginKv.findFirst({
      where: and(eq(schema.pluginKv.projectId, projectId), eq(schema.pluginKv.pluginId, pluginId), eq(schema.pluginKv.key, key)),
    });
    return row?.value;
  }

  private async kvSet(projectId: bigint, pluginId: string, key: string, value: unknown): Promise<void> {
    if (key.length === 0 || key.length > MAX_KV_KEY_LENGTH) throw new PluginStorageError(`kv key must be between 1 and ${MAX_KV_KEY_LENGTH} characters`);

    const serialised = JSON.stringify(value);
    if (serialised === undefined) throw new PluginStorageError('kv value is not JSON-serialisable');
    if (Buffer.byteLength(serialised) > MAX_KV_VALUE_BYTES) throw new PluginStorageError(`kv value exceeds the ${MAX_KV_VALUE_BYTES} byte limit`);

    // bun-sql types a bare JS number or boolean as integer/boolean, which Postgres will not assign to jsonb,
    // and it re-encodes a string bound straight into a jsonb slot. Binding the serialized form as text and
    // parsing it in the database is the one shape that round-trips every JSON value, scalars included.
    const encoded = sql`${serialised}::text::jsonb`;
    await this.db
      .insert(schema.pluginKv)
      .values({ projectId, pluginId, key, value: encoded })
      .onConflictDoUpdate({ target: [schema.pluginKv.projectId, schema.pluginKv.pluginId, schema.pluginKv.key], set: { value: encoded, updatedAt: new Date() } })
      .catch(err => this.databaseService.translateError(err));
  }

  private async kvDelete(projectId: bigint, pluginId: string, key: string): Promise<void> {
    await this.db
      .delete(schema.pluginKv)
      .where(and(eq(schema.pluginKv.projectId, projectId), eq(schema.pluginKv.pluginId, pluginId), eq(schema.pluginKv.key, key)))
      .catch(err => this.databaseService.translateError(err));
  }

  private readBrief(projectId: bigint, chapter: number): Promise<unknown> {
    return this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
  }

  private readDraft(projectId: bigint, chapter: number): Promise<unknown> {
    return this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
  }

  private readEntities(projectId: bigint): Promise<unknown[]> {
    return this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), orderBy: asc(schema.entities.entityKey) });
  }

  private readFacts(projectId: bigint): Promise<unknown[]> {
    return this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: asc(schema.canonFacts.factKey) });
  }
}
