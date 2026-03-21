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
  plugins: [storybookTest()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        { browser: 'firefox', name: 'Firefox' },
        { browser: 'chromium', name: 'Chromium' },
      ],
    },
  },
});
