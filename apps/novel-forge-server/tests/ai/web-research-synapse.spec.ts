import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';

import { WebResearchService } from '@modules/ai/web/web-research.service';

import { FakeSynapse, json, synapseError } from './synapse-fakes';

const SELECTORS = { tier: 'balanced', content_mode: 'standard' };

const catalog = (nativeWebSearch: boolean): Record<string, unknown> => ({
  catalog_version: 3,
  task: 'novel-forge.chat',
  default: { model: 'claude-opus-5.5', label: 'Opus', price: { input: 5, output: 25 }, capabilities: {} },
  aliases: [],
  native_web_search: nativeWebSearch,
});

function service(synapse: FakeSynapse): WebResearchService {
  const research = new WebResearchService(synapse.client);
  (research as unknown as Record<string, unknown>)['logger'] = { warn: () => undefined };
  research.fetcher = () => Promise.reject(new Error('the legacy gateway probe must not run'));
  return research;
}

describe('WebResearchService.modeFor on the synapse backend', () => {
  let restore: RestoreConfig;

  beforeEach(() => {
    restore = setConfig({ 'ai.backend': 'synapse', 'ai.web-search.brave.api.key': 'brave-key' });
  });

  afterEach(() => restore());

  it("should hand the web to the model when the chat task's catalog says it searches natively", async () => {
    const synapse = new FakeSynapse().reply(json(catalog(true)));

    expect(await service(synapse).modeFor('anthropic/claude-opus-5.5', SELECTORS)).toBe('native');
    expect(synapse.requests[0]?.url).toBe('http://synapse-server/api/v1/catalog?task=novel-forge.chat&selectors=content_mode%3Astandard%2Ctier%3Abalanced');
  });

  it('should fall back to Brave, or to no web without its key, when the catalog says no or cannot answer', async () => {
    expect(await service(new FakeSynapse().reply(json(catalog(false)))).modeFor('m', SELECTORS)).toBe('brave');
    expect(await service(new FakeSynapse().reply(synapseError(503, 'SYN_NO_ACTIVE_CATALOG'))).modeFor('m', SELECTORS)).toBe('brave');
    setConfig({ 'ai.web-search.brave.api.key': undefined });
    expect(await service(new FakeSynapse().reply(json(catalog(false)))).modeFor('m', SELECTORS)).toBe('off');
  });
});
