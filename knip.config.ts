import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type KnipConfig } from 'knip';

const ROOT = import.meta.dirname;

function existing(dir: string, patterns: string[]): string[] {
  return patterns.filter(pattern => globSync(pattern, { cwd: resolve(ROOT, dir) }).length > 0);
}

function workspaceDirs(parent: string, suffix: string): string[] {
  return globSync(`${parent}/*${suffix}`, { cwd: ROOT }).sort();
}

// Packages export from `dist/`, so knip cannot follow `exports` back to source; list the `src/` file behind each subpath export.
const PACKAGE_ENTRIES: Record<string, string[]> = {
  'packages/app': ['src/index.ts'],
  'packages/auth': ['src/index.ts', 'src/module/index.ts', 'src/rp/index.ts', 'src/testing/index.ts'],
  'packages/class-schema': ['src/index.ts'],
  'packages/common': [
    'src/index.ts',
    'src/errors/index.ts',
    'src/utils/index.ts',
    'src/interfaces/index.ts',
    'src/services/cache/index.ts',
    'src/services/config.service.ts',
    'src/services/logger/index.ts',
    'src/classes/api-request.ts',
    'src/services/reflector.service.ts',
    'src/crypto/index.ts',
    'src/testing/index.ts',
  ],
  'packages/fastify': ['src/index.ts'],
  'packages/modules': [
    'src/index.ts',
    'src/bootstrap/index.ts',
    'src/http-core/index.ts',
    'src/database/index.ts',
    'src/cache/index.ts',
    'src/storage/index.ts',
    'src/testing/index.ts',
  ],
  'packages/sdk': ['src/index.ts', 'src/publishing/index.ts'],
  'packages/synapse': ['src/index.ts', 'src/langchain/index.ts'],
  'packages/ui': ['src/index.ts'],
  'packages/web': [
    'src/index.ts',
    'src/auth/index.ts',
    'src/router/index.ts',
    'src/server/index.ts',
    'src/server-entry.ts',
    'src/pwa/index.ts',
    'src/service-worker/index.ts',
    'src/offline/index.ts',
  ],
};

// `declare module` augments without importing, so knip reports the dependency unused; removing it fails with TS2664.
const PACKAGE_IGNORED_DEPENDENCIES: Record<string, string[]> = {
  'packages/modules': ['fastify'],
};

// drizzle-kit loads this barrel by path, and drizzle's relational queries read the relations it exports through `import * as schema`.
function drizzleSchemaEntry(dir: string): string {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, dir, 'package.json'), 'utf-8')) as { shadow?: { db?: { schema?: string } } };
  return manifest.shadow?.db?.schema ?? 'src/database/schemas/index.ts';
}

const COLOCATED_TESTS = ['src/**/*.{test,spec}.{ts,tsx}'];

const SERVER_ENTRIES = ['src/main.ts', 'src/worker.ts', 'src/migrate.ts', 'src/dump-openapi.ts', 'tests/**/*.ts', 'drizzle.config.ts'];

// Route modules are discovered by TanStack Router's generator and service workers by a second vite build, so no import graph reaches them.
const WEB_ENTRIES = ['src/routes/**/*.tsx', 'src/routes/**/*.ts', 'src/service-worker.ts', 'src/sw.ts', 'vitest.config.ts', 'tests/**/*.{ts,tsx}'];

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['scripts/*.ts', 'scripts/utils/*.ts', 'scripts/evals/*/*.ts', '*.config.ts'],
      project: ['scripts/**/*.ts', '*.config.ts'],
      // `scripts/build.ts` loads the bundler toolchain through `import(name)` and `scripts/code-health.ts` resolves its analyzers as binaries.
      ignoreDependencies: [
        'jscpd',
        'madge',
        '@rollup/plugin-alias',
        '@rollup/plugin-node-resolve',
        'cssnano',
        'esbuild',
        'postcss',
        'postcss-import',
        'rollup',
        'rollup-plugin-banner2',
        'rollup-plugin-esbuild',
        'rollup-plugin-postcss',
        'tsc-alias',
      ],
    },
    ...Object.fromEntries(
      workspaceDirs('apps', '-server').map(dir => [
        dir,
        {
          entry: existing(dir, [...SERVER_ENTRIES, drizzleSchemaEntry(dir)]),
          project: existing(dir, ['src/**/*.ts', 'tests/**/*.ts']),
          ignoreDependencies: ['drizzle-kit'],
        },
      ]),
    ),
    ...Object.fromEntries(
      workspaceDirs('apps', '-web').map(dir => [
        dir,
        {
          entry: existing(dir, WEB_ENTRIES),
          project: existing(dir, ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.ts']),
          ignore: ['**/*.gen.ts'],
        },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(PACKAGE_ENTRIES).map(([dir, entry]) => [
        dir,
        {
          entry: [...entry, ...existing(dir, [...COLOCATED_TESTS, 'tests/**/*.{ts,tsx}', '*.config.ts', '.storybook/*.{ts,tsx}'])],
          project: existing(dir, [dir === 'packages/ui' ? 'src/**/*.{ts,tsx,mdx}' : 'src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.config.ts']),
          ignoreDependencies: PACKAGE_IGNORED_DEPENDENCIES[dir] ?? [],
        },
      ]),
    ),
    e2e: { entry: ['tests/**/*.ts', 'seed/**/*.ts'], project: ['**/*.ts'] },
  },
  ignoreExportsUsedInFile: true,
  // Spawned by path from another workspace's directory, never imported.
  ignoreUnresolved: [/^scripts\//, 'seed/seed.ts'],
};

export default config;
