/**
 * Importing npm packages
 */
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const isProduction = process.env.NODE_ENV === 'production';

const config: UserConfig = {
  plugins: [devtools(), tanstackStart({ spa: { enabled: true } }), viteReact({})],
  resolve: { tsconfigPaths: true },
  ssr: {
    noExternal: ['@shadow-library/ui'],
  },
};

if (!isProduction) {
  config.server = {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        secure: false,
      },
    },
  };
}

export default defineConfig(config);
