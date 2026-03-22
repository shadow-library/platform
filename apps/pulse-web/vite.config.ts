/**
 * Importing npm packages
 */
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const config = defineConfig({
  plugins: [devtools(), tanstackStart(), viteReact({})],
  resolve: { tsconfigPaths: true },
});

export default config;
