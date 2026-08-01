/**
 * Importing user defined packages
 */
import { createPlaywrightConfig } from '../../scripts/config/playwright.factory.ts';

const isCI = !!process.env.CI;

/**
 * Reuses a running dev server, or starts one. Start server functions reach the identity backend at
 * SERVER_URL (default http://localhost:9091) server-side; the live-flow test needs that backend up.
 */
export default createPlaywrightConfig({
  baseURL: 'http://localhost:3000',
  webServer: {
    command: 'bun dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
