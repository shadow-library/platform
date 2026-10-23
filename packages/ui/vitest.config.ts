import path from 'node:path';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const alias = { '@': path.resolve(import.meta.dirname, 'src') };

export default defineConfig({
  test: {
    projects: [
      {
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
