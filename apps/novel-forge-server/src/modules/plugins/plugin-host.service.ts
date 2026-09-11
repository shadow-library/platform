import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type LoadedPlugin, loadPlugins, validateManifest } from './plugin-loader';
import { type ForgePlugin, type PluginHostApi } from './plugin.types';

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
    const logger = Logger.getLogger(APP_NAME, `plugin:${pluginId}`);
    return {
      log: {
        debug: (msg, meta) => logger.debug(msg, meta),
        info: (msg, meta) => logger.info(msg, meta),
        warn: (msg, meta) => logger.warn(msg, meta),
        error: (msg, meta) => logger.error(msg, meta),
      },
    };
  }
}
