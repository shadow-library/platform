import { asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { computeContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { PluginHost, ScopedPluginHostFactory } from './plugin-host.service';
import { needsReview } from './plugin.service';
import {
  type CallContext,
  type DecisionPoint,
  type ForgePlugin,
  type PluginContextSection,
  type ProjectContext,
  type ScopedPluginHost,
  type WriterClass,
  type WritingKnobs,
} from './plugin.types';

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
  /** A pack outlives the call that assembles it, so its guard runs against the lowest class among the roles that will read it. */
  forPack(call: PolicyCall, consumers: readonly string[]): ForgeCallPolicy;
}

export function raisedContainment(policy: { raised?: boolean } | undefined): { generator: 'unrestricted'; isolated: true } | Record<string, never> {
  return policy?.raised ? { generator: 'unrestricted', isolated: true } : {};
}

export function emptyPolicy(writerClass: WriterClass = 'standard'): ForgeCallPolicy {
  return { writerClass, raised: false, plugins: [], systemMessages: [], contextSections: [], knobs: {}, digest: '' };
}

export interface ActivePlugin {
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

function callContext(entry: ActivePlugin, call: PolicyCall, writerClass: WriterClass): ProjectContext & CallContext {
  return { config: entry.config, host: entry.host, role: call.role, promptKey: call.promptKey ?? call.role, chapter: call.chapter, writerClass };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function normalizeSystemMessage(value: unknown): { role: 'system'; content: string } | undefined {
  const record = asRecord(value);
  const content = readString(record?.['content']);
  return content.trim() ? { role: 'system', content } : undefined;
}

function normalizeContextSection(pluginId: string, value: unknown): PluginContextSection | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const key = readString(record['key']).trim();
  const rendered = readString(record['rendered']);
  if (!key || !rendered.trim()) return undefined;
  const title = readString(record['title']).trim();
  return {
    key: `plugin:${pluginId}:${key}`,
    title: title || key,
    rendered,
    segment: record['segment'] === 'stable' ? 'stable' : 'volatile',
    // Fail closed: only the exact literal opens a section to a standard call, so a mangled or missing field withholds it.
    minWriterClass: record['minWriterClass'] === 'standard' ? 'standard' : 'permissive',
    ...(record['required'] === true ? { required: true } : {}),
  };
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
    const active = await this.active(projectId);
    return { for: call => this.build(active, baseline, call, [call.role]), forPack: (call, consumers) => this.build(active, baseline, call, consumers) };
  }

  /** The plugins that actually contribute on this novel: enabled, still on disk, and validating against the manifest on disk. */
  async active(projectId: bigint): Promise<ActivePlugin[]> {
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

  private build(active: ActivePlugin[], baseline: WriterClass, call: PolicyCall, consumers: readonly string[]): ForgeCallPolicy {
    if (active.length === 0) return emptyPolicy(baseline);

    const plugins: PluginStamp[] = active.map(entry => ({ id: entry.id, version: entry.version, configHash: entry.configHash }));

    // Settled before a single additive hook runs, and at the lowest class among the consumers, so the guard reads a class no later reader can undercut.
    let writerClass: WriterClass = baseline;
    for (const role of consumers) {
      writerClass = this.classFor(active, baseline, { ...call, role });
      if (writerClass === 'standard') break;
    }

    const systemMessages: { role: 'system'; content: string }[] = [];
    const contextSections: PluginContextSection[] = [];
    for (const entry of active) {
      if (!entry.plugin.contributeSystemMessages && !entry.plugin.contributeContextSections) continue;
      const ctx = callContext(entry, call, writerClass);
      for (const value of this.contributions(entry.id, 'prompt.contribute', () => entry.plugin.contributeSystemMessages?.(ctx))) {
        const message = normalizeSystemMessage(value);
        if (message) systemMessages.push(message);
      }
      for (const value of this.contributions(entry.id, 'context.contribute', () => entry.plugin.contributeContextSections?.(ctx))) {
        const section = normalizeContextSection(entry.id, value);
        if (section) contextSections.push(section);
      }
    }

    const content = { writerClass, raised: writerClass === 'permissive' && baseline === 'standard', plugins, systemMessages, contextSections, knobs: {} as WritingKnobs };
    return { ...content, digest: computeContentHash(content) };
  }

  private classFor(active: ActivePlugin[], baseline: WriterClass, call: PolicyCall): WriterClass {
    let votedPermissive = false;
    for (const entry of active) {
      if (!entry.plugin.decideWriterClass) continue;
      // A vote only ever raises: lowering a permissive project to standard is the author's setting, not a plugin's.
      if (this.safely(entry.id, 'call.route', () => entry.plugin.decideWriterClass?.(callContext(entry, call, baseline))) === 'permissive') votedPermissive = true;
    }
    return votedPermissive ? 'permissive' : baseline;
  }

  private contributions(pluginId: string, point: DecisionPoint, fn: () => unknown): unknown[] {
    const result = this.safely(pluginId, point, fn);
    return Array.isArray(result) ? result : [];
  }

  /** A misbehaving plugin degrades its own decision point and never fails the generation. */
  private safely<T>(pluginId: string, point: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      this.logger.warn('plugin decision point threw — contribution dropped', { pluginId, point, reason: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }
}
