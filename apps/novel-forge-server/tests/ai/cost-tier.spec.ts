import { describe, expect, it } from 'bun:test';

import { runWithCostTier, scopedCostTier } from '@modules/ai/cost-tier-scope';
import { CONTENT_MODES, COST_TIERS } from '@modules/ai/defaults';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { schema } from '@server/database';

import { FakeSynapse } from './synapse-fakes';

function router(): ModelRouterService {
  return new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, new FakeSynapse().client);
}

describe('cost tiers', () => {
  it('should mirror the database enums for tiers and content modes', () => {
    expect([...COST_TIERS]).toEqual(schema.costTier.enumValues);
    expect([...CONTENT_MODES]).toEqual(schema.contentMode.enumValues);
  });
});

describe('ModelRouterService.routeModel', () => {
  it('should route a project with no tier to Balanced', () => {
    expect(router().routeModel('generation', { contentMode: 'standard' })).toEqual({ task: 'novel-forge.writing', costTier: 'balanced', contentMode: 'standard' });
  });

  it.each([...COST_TIERS])('should route writing on the %s tier', costTier => {
    expect(router().routeModel('generation', { contentMode: 'standard', costTier })).toEqual({ task: 'novel-forge.writing', costTier, contentMode: 'standard' });
  });

  it('should let a tier carried by a chat turn outrank the project tier, and never its content mode', () => {
    const project: ProjectConfig = { contentMode: 'standard', costTier: 'economy' };

    const route = runWithCostTier('performant', () => router().routeModel('generation', project));

    expect(route).toMatchObject({ costTier: 'performant', contentMode: 'standard' });
  });

  it('should clear an inherited tier when a scope is opened without one', () => {
    const inner = runWithCostTier('performant', () => runWithCostTier(undefined, () => scopedCostTier()));

    expect(inner).toBeUndefined();
    expect(scopedCostTier()).toBeUndefined();
  });

  it('should route a plugin-raised call as unrestricted on its own tier', () => {
    const route = router().routeModel('generation', { contentMode: 'standard', costTier: 'economy' }, { writerClass: 'permissive' } as never);

    expect(route).toMatchObject({ costTier: 'economy', contentMode: 'unrestricted' });
  });

  it('should name the image and embedding tasks, which have no chat task', () => {
    expect(router().routeModel('image').task).toBe('novel-forge.image');
    expect(router().routeModel('embedding').task).toBe('novel-forge.embedding');
  });
});

describe('ModelRouterService telemetry metadata', () => {
  it('should put the tier and content mode beside nfTelemetry on every call the router builds', async () => {
    const ctx = { projectId: 5n, runId: 'run-1', promptKey: 'writer', promptVersion: '1', role: 'generation' };

    const llm = await router().chatFor('generation', ctx, { ownerKind: 'user', ownerId: 1n, contentMode: 'unrestricted', costTier: 'economy' });

    const metadata = (llm as unknown as { metadata: Record<string, unknown> }).metadata;
    expect(metadata).toMatchObject({ costTier: 'economy', contentMode: 'unrestricted', nfTelemetry: { provider: 'synapse', model: 'novel-forge.writing' } });
    expect(metadata['nfTelemetry']).not.toHaveProperty('costTier');
  });
});
