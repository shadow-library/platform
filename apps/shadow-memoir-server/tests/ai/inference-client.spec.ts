import '@server/bootstrap';

import { afterEach, describe, expect, it } from 'bun:test';

import { Config } from '@shadow-library/common';

import { assertInClusterInference } from '@modules/inference';

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
});
