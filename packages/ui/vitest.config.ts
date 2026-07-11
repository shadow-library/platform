/**
 * Importing npm packages
 */
import path from 'node:path';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Declaring the constants
 */
const alias = { '@': path.resolve(import.meta.dirname, 'src') };

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export default defineConfig({
  test: {
    projects: [
      {
        /** Unit tests — headless happy-dom, no browser required (default `test` gate). */
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'happy-dom',
          globals: true,
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        /** Story-based interaction & a11y tests in a real browser (`test:stories`). */
        plugins: [storybookTest()],
        test: {
          name: 'storybook',
          // The browser harness occasionally aborts a worker under load; retry flaky specs so a
          // transient crash doesn't fail an otherwise-green PR.
          retry: 2,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium', name: 'Chromium' }],
          },
        },
      },
    ],
  },
});
