/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { isProduction } from '@server/common';

/**
 * Declaring the constants
 *
 * Regression guard for the fail-fast/Secure-cookie signal: an operator sets `APP_STAGE` (`app.stage`)
 * while `Config.isProd()` reads `NODE_ENV` (`app.env`). Keying only on `NODE_ENV` let an
 * `APP_STAGE=prod` box with `NODE_ENV` unset fall back to insecure dev defaults, so `isProduction()`
 * must treat EITHER signal as production.
 */
describe('isProduction', () => {
  let previousStage: unknown;
  let previousEnv: unknown;

  beforeEach(() => {
    previousStage = Config['cache'].get('app.stage');
    previousEnv = Config['cache'].get('app.env');
  });

  afterEach(() => {
    Config['cache'].set('app.stage', previousStage);
    Config['cache'].set('app.env', previousEnv);
  });

  it('should treat an APP_STAGE=prod deployment as production even when NODE_ENV is not production', () => {
    Config['cache'].set('app.stage', 'prod');
    Config['cache'].set('app.env', 'development');

    expect(isProduction()).toBe(true);
  });

  it('should treat a production NODE_ENV as production even when APP_STAGE is not prod', () => {
    Config['cache'].set('app.stage', 'dev');
    Config['cache'].set('app.env', 'production');

    expect(isProduction()).toBe(true);
  });

  it('should not treat a genuine local dev deployment as production', () => {
    Config['cache'].set('app.stage', 'dev');
    Config['cache'].set('app.env', 'development');

    expect(isProduction()).toBe(false);
  });
});
