import { describe, expect, it } from 'bun:test';

import { type CatalogAliasView, type CatalogAppResponse, type CatalogModelView, type CatalogTaskView } from '@shadow-library/synapse';

import { CATALOG_SELECTIONS, catalogModelLabels, catalogModelsResponse, NovelForgeCatalogService } from '@modules/ai/novel-forge-catalog.service';

import { FakeSynapse, json, synapseError } from './synapse-fakes';

const CAPABILITIES = { tools: true, structuredOutput: 'native', vision: true, context: 1_000_000, reasoning: 'optional', promptCache: 'none', sampling: true } as const;

const model = (key: string, label: string, price: CatalogModelView['price'] = { input: 2, output: 10 }): CatalogModelView => ({
  model: key,
  label,
  price,
  capabilities: CAPABILITIES,
});

const alias = (key: string, label: string, target: string, nativeWebSearch = false): CatalogAliasView => ({
  key,
  label,
  model: target,
  price: { input: 4, output: 20 },
  capabilities: CAPABILITIES,
  state: 'active',
  native_web_search: nativeWebSearch,
});

const task = (defaultModel: CatalogModelView, aliases: CatalogAliasView[] = []): CatalogTaskView => ({ default: defaultModel, aliases, native_web_search: false });

const OPUS = alias('opus', 'Opus', 'claude-opus-5.5', true);
const GROK = alias('grok', 'Grok', 'grok-4.6');
const MINI = alias('gpt-mini', 'GPT Mini', 'gpt-5.4-mini');

function appView(contentMode: string, costTier: string): CatalogAppResponse {
  const unrestricted = contentMode === 'unrestricted';
  const writer = unrestricted ? model('kimi-k3', 'Kimi K3') : costTier === 'performant' ? model('claude-opus-5.5', 'Claude Opus 5.5') : model('claude-sonnet-5', 'Claude Sonnet 5');
  return {
    catalog_version: 7,
    tasks: {
      'novel-forge.writing': task(writer),
      'novel-forge.planning': task(model('claude-opus-5.5', 'Claude Opus 5.5')),
      'novel-forge.review': task(model('deepseek-v4-pro', 'DeepSeek V4 Pro')),
      'novel-forge.chat': task(model('claude-opus-5.5', 'Claude Opus 5.5'), unrestricted ? [GROK] : [OPUS, GROK, MINI]),
      'novel-forge.helper': task(model('gpt-5.6-luna', 'GPT-5.6 Luna')),
      'novel-forge.image': task(model('grok-imagine-image-2.0', 'Grok Imagine Image 2.0', { input: 0, output: 0, perImage: 0.04 })),
      'novel-forge.embedding': task(model('qwen3-embedding-0.6b', 'Qwen3 Embedding 0.6B', { input: 0, output: 0 })),
    },
  };
}

function selectorsOf(url: string): Record<string, string> {
  const raw = new URL(url).searchParams.get('selectors') ?? '';
  return Object.fromEntries(raw.split(',').map(pair => pair.split(':') as [string, string]));
}

/** Answers the app-wide view for whatever selectors were asked, and the chat task view when a task is named. */
function catalogSynapse(): FakeSynapse {
  return new FakeSynapse().answerCatalog(({ url }) => {
    const { content_mode: contentMode = 'standard', tier = 'balanced' } = selectorsOf(url);
    const view = appView(contentMode, tier);
    const taskKey = new URL(url).searchParams.get('task');
    return json(taskKey ? { catalog_version: 7, task: taskKey, ...view.tasks[taskKey] } : view)({ url, body: undefined, signal: undefined });
  });
}

function service(synapse: FakeSynapse = catalogSynapse()): NovelForgeCatalogService {
  const catalog = new NovelForgeCatalogService(synapse.client);
  (catalog as unknown as Record<string, unknown>)['logger'] = { warn: () => undefined };
  return catalog;
}

const views = () => CATALOG_SELECTIONS.map(selection => ({ ...selection, view: appView(selection.contentMode, selection.costTier) }));

describe('NovelForgeCatalogService', () => {
  describe('the models response', () => {
    it('should offer every chat alias once, as a Synapse option in catalog order', () => {
      const response = catalogModelsResponse(views());

      expect(response.models.map(option => [option.id, option.provider, option.label])).toEqual([
        ['opus', 'synapse', 'Opus'],
        ['grok', 'synapse', 'Grok'],
        ['gpt-mini', 'synapse', 'GPT Mini'],
      ]);
      expect(response.models[0]).toMatchObject({ kind: 'llm', enabled: true, contextWindow: 1_000_000, inputPricePerMToken: 4, outputPricePerMToken: 20, supportsTools: true });
    });

    it('should allow in unrestricted chats only the aliases the catalog offers there', () => {
      expect(catalogModelsResponse(views()).unrestrictedAllowlist).toEqual(['grok']);
    });

    it("should give every tier, model type and group the catalog's default model, label and price", () => {
      const { tiers } = catalogModelsResponse(views());

      expect(tiers).toHaveLength(CATALOG_SELECTIONS.length * 6);
      expect(tiers.find(entry => entry.costTier === 'performant' && entry.contentMode === 'standard' && entry.group === 'writing')).toEqual({
        costTier: 'performant',
        contentMode: 'standard',
        group: 'writing',
        provider: 'synapse',
        model: 'claude-opus-5.5',
        label: 'Claude Opus 5.5',
        inputPricePerMToken: 2,
        outputPricePerMToken: 10,
      });
    });

    it('should leave an image model without per-token prices', () => {
      const image = catalogModelsResponse(views()).tiers.find(entry => entry.group === 'image');

      expect(image).toMatchObject({ model: 'grok-imagine-image-2.0', label: 'Grok Imagine Image 2.0' });
      expect(image?.inputPricePerMToken).toBeUndefined();
      expect(image?.outputPricePerMToken).toBeUndefined();
    });

    it('should take the profile defaults from the balanced tier', () => {
      const response = catalogModelsResponse(views());

      expect(response.defaults.find(entry => entry.role === 'writing')).toEqual({ role: 'writing', provider: 'synapse', model: 'claude-sonnet-5' });
      expect(response.unrestrictedDefaults.find(entry => entry.role === 'writing')).toEqual({ role: 'writing', provider: 'synapse', model: 'kimi-k3' });
    });

    it('should read every tier and model type from Synapse', async () => {
      const synapse = catalogSynapse();
      const response = await service(synapse).modelsResponse();

      expect(synapse.catalogRequests.map(request => selectorsOf(request.url))).toEqual(
        CATALOG_SELECTIONS.map(({ costTier, contentMode }) => ({ content_mode: contentMode, tier: costTier })),
      );
      expect(response.models.map(option => option.id)).toEqual(['opus', 'grok', 'gpt-mini']);
    });

    it('should fail as a transient model failure when the catalog cannot be read', async () => {
      const synapse = new FakeSynapse().answerCatalog(synapseError(503, 'SYN_NO_ACTIVE_CATALOG'));

      await expect(service(synapse).modelsResponse()).rejects.toMatchObject({ code: 'AI_007' });
    });
  });

  describe('labels', () => {
    it("should name a routed model by its own label, an alias-only model by its alias's, and a pre-Synapse slug by its historical name", () => {
      const labels = new Map(catalogModelLabels(views().map(({ view }) => view)).map(entry => [entry.model, entry.label]));

      expect(labels.get('claude-opus-5.5')).toBe('Claude Opus 5.5');
      expect(labels.get('gpt-5.4-mini')).toBe('GPT Mini');
      expect(labels.get('kimi-k3')).toBe('Kimi K3');
      expect(labels.get('anthropic/claude-opus-5')).toBe('Claude Opus 5');
    });

    it('should carry prices beside a label, so an old call that recorded no cost can still be estimated', () => {
      const entry = catalogModelLabels(views().map(({ view }) => view)).find(label => label.model === 'anthropic/claude-sonnet-5');

      expect(entry?.inputPricePerMToken).toBeGreaterThan(0);
      expect(entry?.outputPricePerMToken).toBeGreaterThan(0);
    });

    it('should name catalog models', async () => {
      const labels = await service().modelLabels();

      expect(labels.get('deepseek-v4-pro')).toBe('DeepSeek V4 Pro');
      expect(labels.get('x-ai/grok-4.6')).toBe('Grok 4.6');
    });

    it('should keep the historical names when the catalog cannot be read, never failing the view', async () => {
      const labels = await service(new FakeSynapse().answerCatalog(synapseError(503, 'SYN_NO_ACTIVE_CATALOG'))).modelLabels();

      expect(labels.get('x-ai/grok-4.6')).toBe('Grok 4.6');
      expect(labels.has('deepseek-v4-pro')).toBe(false);
    });
  });

  describe('chat aliases', () => {
    it('should return an alias the catalog offers for the selection', async () => {
      expect(await service().requireChatAlias('opus', { contentMode: 'standard', costTier: 'economy' })).toMatchObject({ key: 'opus', native_web_search: true });
    });

    it('should refuse an unknown alias, or one not offered for the selection, as AI_022', async () => {
      await expect(service().requireChatAlias('claude', { contentMode: 'standard', costTier: 'economy' })).rejects.toMatchObject({ code: 'AI_022', data: { alias: 'claude' } });
      await expect(service().requireChatAlias('opus', { contentMode: 'unrestricted', costTier: 'economy' })).rejects.toMatchObject({ code: 'AI_022' });
    });

    it('should list the offered aliases, or nothing to check against when the catalog cannot be read', async () => {
      expect(await service().offeredChatAliases({ contentMode: 'unrestricted', costTier: 'balanced' })).toEqual(['grok']);
      expect(
        await service(new FakeSynapse().answerCatalog(synapseError(503, 'SYN_TIMEOUT'))).offeredChatAliases({ contentMode: 'standard', costTier: 'balanced' }),
      ).toBeUndefined();
    });
  });

  describe('selection models', () => {
    it("should answer a project's groups from the catalog defaults for its selection", async () => {
      const { models } = await service().selectionModels({ contentMode: 'unrestricted', costTier: 'economy' });

      expect(models.map(entry => entry.group)).toEqual(['writing', 'planning', 'review', 'chat', 'helper', 'image']);
      expect(models[0]).toEqual({ group: 'writing', provider: 'synapse', model: 'kimi-k3', label: 'Kimi K3', inputPricePerMToken: 2, outputPricePerMToken: 10 });
    });

    it('should offer the chat only the aliases of that exact selection, not the union across tiers and model types', async () => {
      expect((await service().selectionModels({ contentMode: 'unrestricted', costTier: 'economy' })).chatAliases).toEqual(['grok']);
      expect((await service().selectionModels({ contentMode: 'standard', costTier: 'performant' })).chatAliases).toEqual(['opus', 'grok', 'gpt-mini']);
    });
  });
});
