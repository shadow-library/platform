import { afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { Config } from '@shadow-library/common';
import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';

import { ProvidersViewService } from '@modules/admin/providers-view.service';

import { catalogDocument } from '../catalog/catalog.fixtures';
import { fakeCache, fakeLedger } from './admin.fixtures';

const NOW = new Date('2026-10-17T12:00:00Z');
const SECRET = 'sk-or-super-secret';
let restore: RestoreConfig | undefined;

beforeAll(() => void Config.load('synapse.provider.openrouter.api-key'));
afterEach(() => restore?.());

function serviceOver(outcomes: { provider: string; calls: number; errors: number }[] = [], document = catalogDocument()) {
  const calls: unknown[][] = [];
  const ledger = fakeLedger({
    providerOutcomes: async (...args: unknown[]) => {
      calls.push(args);
      return outcomes;
    },
  });
  return { service: new ProvidersViewService(fakeCache(document), ledger), calls };
}

describe('ProvidersViewService', () => {
  it('should list the catalog providers with the 24 hour error rate', async () => {
    const { service, calls } = serviceOver([
      { provider: 'openrouter', calls: 40, errors: 10 },
      { provider: 'retired-provider', calls: 5, errors: 5 },
    ]);

    const report = await service.report(NOW);

    expect(calls[0]).toEqual([new Date('2026-10-16T12:00:00Z')]);
    expect(report).toMatchObject({ catalogVersion: 3, windowHours: 24 });
    expect(report.providers.map(provider => provider.key)).toEqual(['subscription', 'openrouter', 'local']);
    expect(report.providers.find(provider => provider.key === 'openrouter')).toMatchObject({ calls: 40, errors: 10, errorRate: 0.25 });
  });

  it('should omit the error rate of a provider with no calls', async () => {
    const { service } = serviceOver();

    const subscription = (await service.report(NOW)).providers[0]!;

    expect(subscription).toMatchObject({ calls: 0, errors: 0 });
    expect(subscription).not.toHaveProperty('errorRate');
    expect(subscription.features).toEqual(['sessions', 'native_web_search']);
  });

  it('should say only whether the API key is configured, never its value', async () => {
    restore = setConfig({ 'synapse.provider.openrouter.api-key': SECRET });
    const { service } = serviceOver();

    const report = await service.report(NOW);

    expect(report.providers.find(provider => provider.key === 'openrouter')?.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(JSON.stringify(report)).not.toContain('apiKeyConfig"');
    expect(report.providers.find(provider => provider.key === 'local')).not.toHaveProperty('apiKeyConfigured');
  });

  it('should report an unset API key as not configured', async () => {
    restore = setConfig({ 'synapse.provider.openrouter.api-key': undefined });
    const { service } = serviceOver();

    expect((await service.report(NOW)).providers.find(provider => provider.key === 'openrouter')?.apiKeyConfigured).toBe(false);
  });

  it('should never read a config key outside the provider credential keys', async () => {
    const document = catalogDocument(draft => void (draft.providers.openrouter!.apiKeyConfig = 'server.port'));
    const { service } = serviceOver([], document);

    expect((await service.report(NOW)).providers.find(provider => provider.key === 'openrouter')?.apiKeyConfigured).toBe(false);
  });

  it('should strip credentials embedded in a provider URL', async () => {
    const document = catalogDocument(draft => void (draft.providers.openrouter!.url = `https://user:${SECRET}@openrouter.ai/api/v1`));
    const { service } = serviceOver([], document);

    const openrouter = (await service.report(NOW)).providers.find(provider => provider.key === 'openrouter')!;

    expect(openrouter.url).toBe('https://openrouter.ai/api/v1');
    expect(JSON.stringify(openrouter)).not.toContain(SECRET);
  });
});
