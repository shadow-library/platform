import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      // Vitest initialises every project before applying `--project`, and the storybook plugin indexes every story on init, so `test` runs this file directly.
      './vitest.unit.config.ts',
      {
        plugins: [storybookTest()],
        test: {
          name: 'storybook',
          // The browser harness occasionally aborts a worker under load; retry so a transient crash doesn't fail the run.
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
