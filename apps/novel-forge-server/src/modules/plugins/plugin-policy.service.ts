import { asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { computeContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { PluginHost, ScopedPluginHostFactory } from './plugin-host.service';
import { needsReview } from './plugin.service';
import { type ForgePlugin, type PluginContextSection, type ScopedPluginHost, type WriterClass, type WritingKnobs } from './plugin.types';

export interface PluginStamp {
  id: string;
  version: string;
  configHash: string;
}

export interface ForgeCallPolicy {
  writerClass: WriterClass;
  /** True only when a plugin lifted this call above the project's own class — an unrestricted-mode novel is already permissive and stays uncontained. */
  raised: boolean;
  plugins: PluginStamp[];
  systemMessages: { role: 'system'; content: string }[];
  contextSections: PluginContextSection[];
  knobs: WritingKnobs;
  digest: string;
}

export interface PolicyCall {
  role: string;
  promptKey?: string;
  chapter?: number;
}

export interface ProjectBaseline {
  contentMode?: Project.ContentMode | null;
}

export interface ScopedPolicyResolver {
  for(call: PolicyCall): ForgeCallPolicy;
}

export function raisedContainment(policy: { raised?: boolean } | undefined): { generator: 'unrestricted'; isolated: true } | Record<string, never> {
  return policy?.raised ? { generator: 'unrestricted', isolated: true } : {};
}

export function emptyPolicy(writerClass: WriterClass = 'standard'): ForgeCallPolicy {
  return { writerClass, raised: false, plugins: [], systemMessages: [], contextSections: [], knobs: {}, digest: '' };
}

interface ActivePlugin {
  id: string;
  version: string;
  config: Record<string, unknown>;
  configHash: string;
  plugin: ForgePlugin;
  host: ScopedPluginHost;
}

function baselineClass(project: ProjectBaseline | undefined): WriterClass {
  return project?.contentMode === 'unrestricted' ? 'permissive' : 'standard';
}

@Injectable()
export class PluginPolicyService {
  private readonly logger = Logger.getLogger(APP_NAME, PluginPolicyService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly pluginHost: PluginHost,
    private readonly scopedHosts: ScopedPluginHostFactory,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async resolve(projectId: bigint, call: PolicyCall, project?: ProjectBaseline): Promise<ForgeCallPolicy> {
    const resolver = await this.scoped(projectId, project);
    return resolver.for(call);
  }

  /** Resolving this once is what holds a run to a single `project_plugins` read across the dozens of model calls a graph makes. */
  async scoped(projectId: bigint, project?: ProjectBaseline): Promise<ScopedPolicyResolver> {
    const row = project ?? (await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { contentMode: true } }));
    const baseline = baselineClass(row);
    const active = await this.loadActive(projectId);
    return { for: call => this.build(active, baseline, call) };
  }

  private async loadActive(projectId: bigint): Promise<ActivePlugin[]> {
    const rows = await this.db.query.projectPlugins.findMany({
      where: eq(schema.projectPlugins.projectId, projectId),
      orderBy: [asc(schema.projectPlugins.ordinal), asc(schema.projectPlugins.pluginId)],
    });

    const active: ActivePlugin[] = [];
    for (const row of rows) {
      const loaded = this.pluginHost.get(row.pluginId);
      if (!loaded || needsReview(loaded, row)) continue;
      active.push({
        id: row.pluginId,
        version: loaded.manifest.version,
        config: row.config,
        // jsonb normalises key order on read, so only a canonicalising digest keeps the stamp stable.
        configHash: computeContentHash(row.config),
        plugin: loaded.plugin,
        host: this.scopedHosts.create(row.pluginId, projectId),
      });
    }
    return active;
  }

  private build(active: ActivePlugin[], baseline: WriterClass, call: PolicyCall): ForgeCallPolicy {
    if (active.length === 0) return emptyPolicy(baseline);

    const plugins: PluginStamp[] = [];
    let votedPermissive = false;
    for (const entry of active) {
      plugins.push({ id: entry.id, version: entry.version, configHash: entry.configHash });
      if (!entry.plugin.decideWriterClass) continue;
      const ctx = { config: entry.config, host: entry.host, role: call.role, promptKey: call.promptKey ?? call.role, chapter: call.chapter, writerClass: baseline };
      // A vote only ever raises: lowering a permissive project to standard is the author's setting, not a plugin's.
      if (this.safely(entry.id, 'call.route', () => entry.plugin.decideWriterClass?.(ctx)) === 'permissive') votedPermissive = true;
    }

    const content = {
      writerClass: (votedPermissive ? 'permissive' : baseline) as WriterClass,
      raised: votedPermissive && baseline === 'standard',
      plugins,
      systemMessages: [] as { role: 'system'; content: string }[],
      contextSections: [] as PluginContextSection[],
      knobs: {} as WritingKnobs,
    };
    return { ...content, digest: computeContentHash(content) };
  }

  /** §10: a misbehaving plugin degrades its own decision point and never fails the generation. */
  private safely<T>(pluginId: string, point: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      this.logger.warn('plugin decision point threw — contribution dropped', { pluginId, point, reason: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }
}
