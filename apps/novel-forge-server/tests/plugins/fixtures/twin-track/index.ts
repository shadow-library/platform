import type {
  BriefSummary,
  CallContext,
  ForgePlugin,
  PluginChangeOp,
  PluginContextSection,
  PluginManifest,
  ProjectContext,
  WriterClass,
} from '../../../../src/modules/plugins/plugin.types';

import manifest from './manifest.json';

const SYSTEM_MESSAGE_ROLES = new Set(['generation', 'revision', 'fix']);

interface TwinTrackConfig {
  markedChapters: string;
  noteText: string;
  addFact: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfig(config: unknown): TwinTrackConfig {
  const record = isRecord(config) ? config : {};
  return {
    markedChapters: typeof record['markedChapters'] === 'string' ? record['markedChapters'] : '',
    noteText: typeof record['noteText'] === 'string' ? record['noteText'] : '',
    addFact: typeof record['addFact'] === 'boolean' ? record['addFact'] : false,
  };
}

function markedChapterSet(config: TwinTrackConfig): Set<number> {
  return new Set(
    config.markedChapters
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0)
      .map(Number)
      .filter(Number.isFinite),
  );
}

function augmentCanon(ctx: ProjectContext): PluginChangeOp[] {
  const config = readConfig(ctx.config);
  if (!config.addFact) return [];
  return [{ op: 'fact.upsert', factKey: 'twin-track', body: config.noteText }];
}

function decideBriefPolicy(ctx: ProjectContext & { briefs: BriefSummary[] }): PluginChangeOp[] {
  const config = readConfig(ctx.config);
  const chapters = markedChapterSet(config);
  const ops: PluginChangeOp[] = [];
  for (const brief of ctx.briefs) {
    if (!chapters.has(brief.chapter)) continue;
    const needsRewrite = !brief.title.includes(config.noteText) && !brief.body.includes(config.noteText);
    ops.push({
      op: 'brief.update',
      chapter: brief.chapter,
      writeMode: 'external',
      rationale: `chapter ${brief.chapter} is one of the marked chapters`,
      ...(needsRewrite ? { title: config.noteText, body: config.noteText } : {}),
    });
  }
  return ops;
}

function decideWriterClass(ctx: ProjectContext & CallContext): WriterClass | undefined {
  if (ctx.chapter === undefined) return undefined;
  const config = readConfig(ctx.config);
  return markedChapterSet(config).has(ctx.chapter) ? 'permissive' : undefined;
}

function contributeContextSections(ctx: ProjectContext & CallContext): PluginContextSection[] {
  const config = readConfig(ctx.config);
  return [{ key: 'note', title: 'Note', rendered: config.noteText, segment: 'volatile', minWriterClass: 'permissive' }];
}

function contributeSystemMessages(ctx: ProjectContext & CallContext): { role: 'system'; content: string }[] {
  if (!SYSTEM_MESSAGE_ROLES.has(ctx.role)) return [];
  const config = readConfig(ctx.config);
  return [{ role: 'system', content: config.noteText }];
}

function createPlugin(): ForgePlugin {
  return {
    id: 'twin-track',
    manifest: () => manifest as unknown as PluginManifest,
    augmentCanon,
    decideBriefPolicy,
    decideWriterClass,
    contributeContextSections,
    contributeSystemMessages,
  };
}

export default createPlugin;
