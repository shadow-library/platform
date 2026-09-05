import { afterEach, describe, expect, it } from 'bun:test';

import { AppError, Config } from '@shadow-library/common';

import { DEV_PSEUDO_ID_SECRET } from '@server/constants';
import { assertTelemetryPseudoIdSecret } from '@server/telemetry';

describe('assertTelemetryPseudoIdSecret', () => {
  const originalStage = Config['cache'].get('app.stage');
  const originalEnv = Config['cache'].get('app.env');

  afterEach(() => {
    Config['cache'].set('app.stage', originalStage);
    Config['cache'].set('app.env', originalEnv);
  });

  function asProductionDeployment(): void {
    Config['cache'].set('app.stage', 'prod');
    Config['cache'].set('app.env', 'development');
  }

  function asDevelopment(): void {
    Config['cache'].set('app.stage', 'dev');
    Config['cache'].set('app.env', 'development');
  }

  it('should refuse to boot on a production deployment when the secret is still the dev default', () => {
    asProductionDeployment();
    expect(() => assertTelemetryPseudoIdSecret(DEV_PSEUDO_ID_SECRET)).toThrow(AppError);
  });

  it('should refuse to boot on a production deployment when the secret is unset', () => {
    asProductionDeployment();
    expect(() => assertTelemetryPseudoIdSecret('')).toThrow(AppError);
  });

  it('should boot on a production deployment once a real secret is provisioned', () => {
    asProductionDeployment();
    expect(() => assertTelemetryPseudoIdSecret('a-real-provisioned-secret')).not.toThrow();
  });

  it('should not throw in development even with the dev default secret', () => {
    asDevelopment();
    expect(() => assertTelemetryPseudoIdSecret(DEV_PSEUDO_ID_SECRET)).not.toThrow();
  });

  it('should not throw in development when the secret is unset', () => {
    asDevelopment();
    expect(() => assertTelemetryPseudoIdSecret('')).not.toThrow();
  });
});
