import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Plugins, type PrimaryDatabase, schema } from '@server/database';

import { type LoadedPlugin } from './plugin-loader';
import { PluginHost, ScopedPluginHostFactory } from './plugin-host.service';
import { type EnablePluginBody } from './plugin.dto';
import { type DecisionPoint, type ForgePlugin, type PluginForm } from './plugin.types';

export interface ProjectPluginView {
  pluginId: string;
  pluginVersion: string;
  config: Record<string, unknown>;
  ordinal: number;
  installed: boolean;
  needsReview: boolean;
  enabledAt: Date;
  updatedAt: Date;
}

const SETTINGS_FORM = 'settings';

/**
 * Unknown keys are rejected: a form the plugin no longer declares is config the plugin has stopped reading,
 * and silently carrying it is how stale settings outlive their meaning.
 */
export function validateConfig(form: PluginForm | undefined, config: Record<string, unknown>): string | undefined {
  const fields = new Map((form?.fields ?? []).map(field => [field.name, field]));

  for (const key of Object.keys(config)) if (!fields.has(key)) return `"${key}" is not a declared setting`;
  for (const name of form?.required ?? []) if (config[name] === undefined) return `"${name}" is required`;

  for (const [name, field] of fields) {
    const value = config[name];
    if (value === undefined) continue;
    if (typeof value !== field.type) return `"${name}" must be a ${field.type}`;
    // JSON.parse overflows an out-of-range literal such as 1e400 to Infinity, which JSON.stringify then stores as null.
    if (field.type === 'number' && !Number.isFinite(value)) return `"${name}" must be a finite number`;
    if (field.enum && !field.enum.includes(value as string)) return `"${name}" must be one of ${field.enum.join(', ')}`;
  }

  return undefined;
}

/** A row whose plugin moved on keeps its claim but contributes nothing until the author re-saves a config the new manifest accepts. */
export function needsReview(loaded: LoadedPlugin, row: { pluginVersion: string; config: Record<string, unknown> }): boolean {
  if (loaded.manifest.version === row.pluginVersion) return false;
  return validateConfig(loaded.manifest.forms[SETTINGS_FORM], row.config) !== undefined;
}

@Injectable()
export class PluginService {
  private readonly logger = Logger.getLogger(APP_NAME, PluginService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly pluginHost: PluginHost,
    private readonly scopedHosts: ScopedPluginHostFactory,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint): Promise<ProjectPluginView[]> {
    const rows = await this.db.query.projectPlugins.findMany({
      where: eq(schema.projectPlugins.projectId, projectId),
      orderBy: [asc(schema.projectPlugins.ordinal), asc(schema.projectPlugins.pluginId)],
    });
    return rows.map(row => this.toView(row));
  }

  async enable(projectId: bigint, pluginId: string, body: EnablePluginBody): Promise<ProjectPluginView> {
    const loaded = this.pluginHost.get(pluginId);
    if (!loaded) throw AppErrorCode.PLG_001.create();

    const config = body.config ?? {};
    const reason = validateConfig(loaded.manifest.forms[SETTINGS_FORM], config);
    if (reason) throw AppErrorCode.PLG_003.create({ reason });

    await this.assertExclusivityIsFree(projectId, pluginId, loaded.manifest.exclusive ?? []);
    await this.runOnEnable(projectId, pluginId, loaded.plugin, config);

    const values = { projectId, pluginId, pluginVersion: loaded.manifest.version, config, ordinal: body.ordinal ?? 0 };
    const [row] = await this.db
      .insert(schema.projectPlugins)
      .values(values)
      .onConflictDoUpdate({ target: [schema.projectPlugins.projectId, schema.projectPlugins.pluginId], set: { ...values, updatedAt: new Date() } })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!row) throw AppErrorCode.S001.create();

    return this.toView(row);
  }

  async disable(projectId: bigint, pluginId: string): Promise<void> {
    const row = await this.db.query.projectPlugins.findFirst({
      where: and(eq(schema.projectPlugins.projectId, projectId), eq(schema.projectPlugins.pluginId, pluginId)),
    });
    if (!row) return;

    const loaded = this.pluginHost.get(pluginId);
    if (loaded?.plugin.onDisable) {
      const host = this.scopedHosts.create(pluginId, projectId);
      try {
        await loaded.plugin.onDisable({ config: row.config, host });
      } catch (err) {
        this.logger.warn('plugin onDisable threw — disabling anyway', { pluginId, projectId: projectId.toString(), reason: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.db
      .delete(schema.projectPlugins)
      .where(eq(schema.projectPlugins.id, row.id))
      .catch(err => this.databaseService.translateError(err));
  }

  /**
   * A row whose plugin left the disk keeps no claim, because it contributes to nothing; a row that needs
   * review keeps its claim, because the claim is a property of the manifest rather than of the config.
   */
  private async assertExclusivityIsFree(projectId: bigint, pluginId: string, claims: DecisionPoint[]): Promise<void> {
    if (claims.length === 0) return;

    const rows = await this.db.query.projectPlugins.findMany({ where: eq(schema.projectPlugins.projectId, projectId), columns: { pluginId: true } });
    for (const row of rows) {
      if (row.pluginId === pluginId) continue;
      const other = this.pluginHost.get(row.pluginId)?.manifest.exclusive ?? [];
      const conflict = claims.find(point => other.includes(point));
      if (conflict) throw AppErrorCode.PLG_004.create({ decisionPoint: conflict });
    }
  }

  /** A semantic rule the form cannot express is the plugin's to enforce, so its throw is the author's `PLG_003`, never a 500. */
  private async runOnEnable(projectId: bigint, pluginId: string, plugin: ForgePlugin, config: Record<string, unknown>): Promise<void> {
    if (!plugin.onEnable) return;

    const host = this.scopedHosts.create(pluginId, projectId);
    try {
      await plugin.onEnable({ config, host });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn('plugin onEnable rejected the config', { pluginId, projectId: projectId.toString(), reason });
      throw AppErrorCode.PLG_003.create({ reason });
    }
  }

  private toView(row: Plugins.ProjectPlugin): ProjectPluginView {
    const loaded = this.pluginHost.get(row.pluginId);
    const view: ProjectPluginView = {
      pluginId: row.pluginId,
      pluginVersion: row.pluginVersion,
      config: row.config,
      ordinal: row.ordinal,
      installed: loaded !== undefined,
      needsReview: false,
      enabledAt: row.enabledAt,
      updatedAt: row.updatedAt,
    };

    if (!loaded) return view;
    return { ...view, needsReview: needsReview(loaded, row) };
  }
}
