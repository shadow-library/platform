import { describe, expect, it } from 'bun:test';

import { runWithCostTier, scopedCostTier } from '@modules/ai/cost-tier-scope';
import {
  type AiRole,
  CONTENT_MODES,
  COST_TIER_DEFAULTS,
  COST_TIERS,
  isRegisteredModel,
  isUnrestrictedAllowed,
  type ModelGroup,
  PRODUCTION_DEFAULTS,
  PRODUCTION_GROUP_DEFAULTS,
  type ResolvedModel,
  ROLE_GROUP,
  SELECTABLE_MODEL_GROUPS,
  UNRESTRICTED_DEFAULTS,
  UNRESTRICTED_GROUP_DEFAULTS,
} from '@modules/ai/defaults';
import { tierCatalog } from '@modules/ai/model-catalog.service';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { MODEL_MAP } from '@modules/ai/models';
import { resolveUnrestrictedRoute } from '@modules/ai/unrestricted-route';
import { schema } from '@server/database';
import { Config } from '@shadow-library/common';

const GROUPS = Object.keys(PRODUCTION_GROUP_DEFAULTS) as ModelGroup[];
const ROLES = Object.keys(ROLE_GROUP) as AiRole[];
const GROUP_ROLE: Record<ModelGroup, AiRole> = {
  writing: 'generation',
  planning: 'plan',
  review: 'judge',
  chat: 'chat',
  helper: 'title',
  image: 'image',
  vision: 'vision',
  embedding: 'embedding',
};

const opus: ResolvedModel = { provider: 'openrouter', model: 'anthropic/claude-opus-5' };
const kimi: ResolvedModel = { provider: 'openrouter', model: 'moonshotai/kimi-k3' };

function router(): ModelRouterService {
  return new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, { enforce: async () => undefined } as never);
}

function price(model: ResolvedModel): [number, number] {
  const entry = MODEL_MAP[model.model];
  return [entry?.inputPricePerMToken ?? 0, entry?.outputPricePerMToken ?? 0];
}

describe('COST_TIER_DEFAULTS', () => {
  it('should mirror the database enums for tiers and content modes', () => {
    expect([...COST_TIERS]).toEqual(schema.costTier.enumValues);
    expect([...CONTENT_MODES]).toEqual(schema.contentMode.enumValues);
  });

  it('should keep Balanced identical to the pre-tier group defaults', () => {
    expect(COST_TIER_DEFAULTS.balanced.standard).toEqual(PRODUCTION_GROUP_DEFAULTS);
    expect(COST_TIER_DEFAULTS.balanced.unrestricted).toEqual(UNRESTRICTED_GROUP_DEFAULTS);
  });

  it('should name a registered model with its registry provider for every tier, mode and group', () => {
    for (const tier of COST_TIERS) {
      for (const mode of CONTENT_MODES) {
        for (const group of GROUPS) expect({ tier, mode, group, registered: isRegisteredModel(COST_TIER_DEFAULTS[tier][mode][group]) }).toMatchObject({ registered: true });
      }
    }
  });

  it('should keep every unrestricted tier inside the unrestricted allowlist', () => {
    for (const tier of COST_TIERS) {
      for (const group of GROUPS)
        expect({ tier, group, allowed: isUnrestrictedAllowed(GROUP_ROLE[group], COST_TIER_DEFAULTS[tier].unrestricted[group]) }).toMatchObject({ allowed: true });
    }
  });

  it('should keep vision image-capable, image on an image model and embedding on the pgvector model in every tier', () => {
    for (const tier of COST_TIERS) {
      for (const mode of CONTENT_MODES) {
        const groups = COST_TIER_DEFAULTS[tier][mode];
        expect(MODEL_MAP[groups.vision.model]?.supportsImageInput).toBe(true);
        expect(MODEL_MAP[groups.image.model]?.kind).toBe('image');
        expect(groups.embedding).toEqual(PRODUCTION_GROUP_DEFAULTS.embedding);
      }
    }
  });

  it('should never get cheaper from Economy to Balanced to Performant, per group and mode', () => {
    for (const mode of CONTENT_MODES) {
      for (const group of GROUPS) {
        const [economy, balanced, performant] = COST_TIERS.map(tier => price(COST_TIER_DEFAULTS[tier][mode][group]));
        const ordered = (a?: [number, number], b?: [number, number]): boolean => Boolean(a && b && a[0] <= b[0] && a[1] <= b[1]);
        expect({ mode, group, ordered: ordered(economy, balanced) && ordered(balanced, performant) }).toMatchObject({ ordered: true });
      }
    }
  });

  const outputPrices = (group: ModelGroup): (number | undefined)[] => COST_TIERS.map(tier => price(COST_TIER_DEFAULTS[tier].standard[group])[1]);

  it('should make standard Economy cheaper than Balanced for writing, planning, review and chat', () => {
    for (const group of ['writing', 'planning', 'review', 'chat'] as const) {
      const [economy, balanced] = outputPrices(group);
      expect({ group, cheaper: (economy as number) < (balanced as number) }).toMatchObject({ cheaper: true });
    }
  });

  it('should make standard Performant dearer than Balanced for writing, review and helper', () => {
    for (const group of ['writing', 'review', 'helper'] as const) {
      const [, balanced, performant] = outputPrices(group);
      expect({ group, dearer: (performant as number) > (balanced as number) }).toMatchObject({ dearer: true });
    }
  });

  it('should keep standard Performant equal to Balanced for planning and chat, which already run on the strongest model', () => {
    for (const group of ['planning', 'chat'] as const) expect(COST_TIER_DEFAULTS.performant.standard[group]).toEqual(COST_TIER_DEFAULTS.balanced.standard[group]);
  });
});

describe('tierCatalog', () => {
  it('should list every tier × mode × author-selectable group with its label and prices', () => {
    const catalog = tierCatalog();

    expect(catalog).toHaveLength(COST_TIERS.length * CONTENT_MODES.length * SELECTABLE_MODEL_GROUPS.length);
    expect(catalog).toContainEqual({
      costTier: 'economy',
      contentMode: 'standard',
      group: 'writing',
      provider: 'openrouter',
      model: 'anthropic/claude-haiku-4.5',
      label: 'Claude Haiku 4.5',
      inputPricePerMToken: 1,
      outputPricePerMToken: 5,
    });
    expect(catalog.find(entry => entry.group === 'image')?.inputPricePerMToken).toBeUndefined();
  });
});

describe('ModelRouterService.routeModel', () => {
  it('should resolve every role exactly as before the tiers when a project is Balanced or has no tier', () => {
    for (const role of ROLES) {
      expect(router().resolveModel(role, { contentMode: 'standard' })).toEqual(PRODUCTION_DEFAULTS[role]);
      expect(router().resolveModel(role, { contentMode: 'standard', costTier: 'balanced' })).toEqual(PRODUCTION_DEFAULTS[role]);
      expect(router().resolveModel(role, { contentMode: 'unrestricted', costTier: 'balanced' })).toEqual(UNRESTRICTED_DEFAULTS[role]);
    }
  });

  it.each([
    ['a project pin beats the Economy tier', { costTier: 'economy', config: { models: { generation: opus } } }, opus, 'project'],
    ['a project pin beats the Balanced tier', { costTier: 'balanced', config: { models: { generation: kimi } } }, kimi, 'project'],
    ['Economy falls back to its tier map', { costTier: 'economy' }, COST_TIER_DEFAULTS.economy.standard.writing, 'tier'],
    ['Balanced falls back to its tier map', { costTier: 'balanced' }, COST_TIER_DEFAULTS.balanced.standard.writing, 'tier'],
    ['Performant falls back to its tier map', { costTier: 'performant' }, COST_TIER_DEFAULTS.performant.standard.writing, 'tier'],
  ] as const)('should resolve writing in order: %s', (_name, project, expected, source) => {
    const route = router().routeModel('generation', { contentMode: 'standard', ...project } as ProjectConfig);

    expect(route).toMatchObject({ resolved: expected, source, costTier: project.costTier, contentMode: 'standard' });
  });

  it('should inherit the planning pin for chat before the tier map', () => {
    const route = router().routeModel('chat', { contentMode: 'standard', costTier: 'economy', config: { models: { plan: opus } } });

    expect(route).toMatchObject({ resolved: opus, source: 'project' });
  });

  it('should let a tier carried by a chat turn outrank the project tier, and never its content mode', () => {
    const project: ProjectConfig = { contentMode: 'standard', costTier: 'economy' };

    const route = runWithCostTier('performant', () => router().routeModel('generation', project));

    expect(route).toMatchObject({ resolved: COST_TIER_DEFAULTS.performant.standard.writing, costTier: 'performant', contentMode: 'standard' });
  });

  it('should clear an inherited tier when a scope is opened without one', () => {
    const inner = runWithCostTier('performant', () => runWithCostTier(undefined, () => scopedCostTier()));

    expect(inner).toBeUndefined();
    expect(scopedCostTier()).toBeUndefined();
  });

  it('should resolve a plugin-raised call on the unrestricted map of its tier', () => {
    const route = router().routeModel('generation', { contentMode: 'standard', costTier: 'economy' }, { writerClass: 'permissive' } as never);

    expect(route).toMatchObject({ resolved: COST_TIER_DEFAULTS.economy.unrestricted.writing, contentMode: 'unrestricted' });
  });

  it('should never resolve an unrestricted call off the allowlist, whatever the tier or the standard pins around it', () => {
    const pins = Object.fromEntries(ROLES.map(role => [role, opus]));
    for (const costTier of COST_TIERS) {
      for (const role of ROLES) {
        const resolved = router().resolveModel(role, { contentMode: 'unrestricted', costTier, config: { models: pins } });
        expect({ costTier, role, allowed: isUnrestrictedAllowed(role, resolved) }).toMatchObject({ allowed: true });
      }
    }
  });

  it('should pass every unrestricted tier through the unrestricted route without a refusal', async () => {
    const real = router();
    const deps = { pluginPolicy: { resolve: async () => ({ writerClass: 'permissive' }) as never }, modelRouter: real };
    for (const costTier of COST_TIERS) {
      for (const role of ROLES) await expect(resolveUnrestrictedRoute(deps, 1n, { role }, { contentMode: 'standard', costTier })).resolves.toBeDefined();
    }
  });
});

describe('ModelRouterService telemetry metadata', () => {
  function setConfig(key: string, value: unknown): void {
    (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
  }

  it('should put the tier and content mode beside nfTelemetry on every call the router builds', async () => {
    setConfig('ai.openrouter.api.key', 'test-openrouter-key');
    setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');
    const ctx = { projectId: 5n, runId: 'run-1', promptKey: 'writer', promptVersion: '1', role: 'generation' };

    const llm = await router().chatFor('generation', ctx, { contentMode: 'unrestricted', costTier: 'economy' });

    const metadata = (llm as unknown as { metadata: Record<string, unknown> }).metadata;
    expect(metadata).toMatchObject({ costTier: 'economy', contentMode: 'unrestricted', nfTelemetry: { model: COST_TIER_DEFAULTS.economy.unrestricted.writing.model } });
    expect(metadata['nfTelemetry']).not.toHaveProperty('costTier');
  });
});
