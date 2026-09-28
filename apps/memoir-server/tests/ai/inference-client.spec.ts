import '@server/bootstrap';

import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { Config } from '@shadow-library/common';

import { assertInClusterInference, OllamaInferenceClient } from '@modules/inference';

/**
 * Both signals behind `Config.isProductionDeployment()` are pinned per case rather than inherited:
 * `app.stage` fails safe to `prod` when `APP_STAGE` is unset, so a spec that only assumed a dev context
 * would pass or fail on whether a workspace `.env` happened to set it.
 */
describe('In-cluster inference boundary (T-33, D6, ARCHITECTURE §15.6)', () => {
  const originalStage = Config['cache'].get('app.stage');
  const originalEnv = Config['cache'].get('app.env');

  function asDeployment(stage: string, env = 'production'): void {
    Config['cache'].set('app.stage', stage);
    Config['cache'].set('app.env', env);
  }

  function asDeveloperMachine(): void {
    Config['cache'].set('app.stage', 'dev');
    Config['cache'].set('app.env', 'development');
  }

  afterEach(() => {
    Config['cache'].set('app.stage', originalStage);
    Config['cache'].set('app.env', originalEnv);
  });

  it('should allow any host outside a production deployment, so local inference still works in development', () => {
    asDeveloperMachine();
    expect(() => assertInClusterInference('http://localhost:11434')).not.toThrow();
    expect(() => assertInClusterInference('https://api.openai.com')).not.toThrow();
  });

  it('should accept an unset url as "no inference configured" rather than a boundary violation', () => {
    asDeployment('prod');
    expect(() => assertInClusterInference('')).not.toThrow();
  });

  it('should allow an in-cluster service name on a production deployment', () => {
    asDeployment('prod');
    expect(() => assertInClusterInference('http://memoir-inference.shadow-apps.svc:11434')).not.toThrow();
    expect(() => assertInClusterInference('http://memoir-inference.shadow-apps.svc.cluster.local:11434')).not.toThrow();
    expect(() => assertInClusterInference('svc://memoir-inference')).not.toThrow();
  });

  it('should refuse a third-party or otherwise off-cluster host on a production deployment', () => {
    asDeployment('prod');
    expect(() => assertInClusterInference('https://api.openai.com/v1')).toThrow(/not in-cluster/);
    expect(() => assertInClusterInference('http://openrouter.ai')).toThrow(/not in-cluster/);
    expect(() => assertInClusterInference('http://localhost:11434')).toThrow(/not in-cluster/);
  });

  it('should enforce the boundary on a NODE_ENV=production box whose stage was never set', () => {
    asDeployment('dev');
    expect(() => assertInClusterInference('https://api.openai.com/v1')).toThrow(/not in-cluster/);
  });

  it('should enforce the boundary when the stage is unset, so a forgotten APP_STAGE loses inference rather than the guarantee', () => {
    asDeployment('prod', 'development');
    expect(() => assertInClusterInference('https://api.openai.com/v1')).toThrow(/not in-cluster/);
  });

  describe('svc:// addresses', () => {
    const overrideKey = 'SERVICE_URL_MEMOIR_INFERENCE';

    afterEach(() => {
      delete process.env[overrideKey];
    });

    it('should refuse a svc:// name that resolves outside the cluster on a production deployment', () => {
      asDeployment('prod');
      expect(() => assertInClusterInference('svc://api.openai.com')).toThrow(/not in-cluster/);
      expect(() => assertInClusterInference('svc://openai.com/v1')).toThrow(/not in-cluster/);
      expect(() => assertInClusterInference('svc://localhost')).toThrow(/not in-cluster/);
    });

    it('should refuse an in-cluster svc:// name whose service url override points off-cluster', () => {
      asDeployment('prod');
      process.env[overrideKey] = 'https://api.openai.com';
      expect(() => assertInClusterInference('svc://memoir-inference')).toThrow(/not in-cluster/);
    });

    it('should allow a bare or *.svc service name, and an override that stays in-cluster', () => {
      asDeployment('prod');
      expect(() => assertInClusterInference('svc://memoir-inference')).not.toThrow();
      expect(() => assertInClusterInference('svc://memoir-inference.shadow-apps.svc')).not.toThrow();
      process.env[overrideKey] = 'http://memoir-inference.shadow-apps.svc.cluster.local:11434';
      expect(() => assertInClusterInference('svc://memoir-inference')).not.toThrow();
    });

    it('should dial the address service discovery resolves, keeping the scheme it configures', async () => {
      const originalUrl = Config['cache'].get('ai.inference-url');
      Config['cache'].set('ai.inference-url', 'svc://memoir-inference');
      process.env[overrideKey] = 'https://memoir-inference.shadow-apps.svc:11434';
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ message: { content: '{"ok":true}' } }));

      try {
        const answer = await new OllamaInferenceClient().completeJson({ systemPrompt: 's', userPrompt: 'u' });

        expect(answer).toEqual({ ok: true });
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://memoir-inference.shadow-apps.svc:11434/api/chat');
      } finally {
        fetchSpy.mockRestore();
        Config['cache'].set('ai.inference-url', originalUrl);
      }
    });
  });
});
