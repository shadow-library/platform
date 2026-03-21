/**
 * Importing npm packages
 */
import path from 'node:path';

import { defineMain } from '@storybook/react-vite/node';
import { mergeConfig } from 'vite';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export default defineMain({
  stories: ['../src/**/*.stories.@(ts|tsx)', './mantine-showcase/**/*.stories.@(ts|tsx)'],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs', '@storybook/addon-themes'],
  framework: '@storybook/react-vite',
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@': path.resolve(import.meta.dirname, '../src'),
          $storybook: import.meta.dirname,
        },
      },
    });
  },
});
