/**
 * Importing npm packages
 */

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

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
