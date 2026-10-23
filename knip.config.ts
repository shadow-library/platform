import { globSync } from 'node:fs';
import { resolve } from 'node:path';

import { type KnipConfig } from 'knip';

const ROOT = import.meta.dirname;

function existing(dir: string, patterns: string[]): string[] {
  return patterns.filter(pattern => globSync(pattern, { cwd: resolve(ROOT, dir) }).length > 0);
}

function workspaceDirs(parent: string, suffix: string): string[] {
  return globSync(`${parent}/*${suffix}`, { cwd: ROOT }).sort();
}

/**
 * Every package publishes from `dist/`, so knip cannot follow its `exports` map back to source. Each
 * package therefore lists the `src/` file behind every subpath export — anything else in the package is
 * reachable only through one of these, which is exactly the reachability question knip is being asked.
 */
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
  ],
  'packages/fastify': ['src/index.ts'],
  'packages/modules': ['src/index.ts', 'src/bootstrap/index.ts', 'src/http-core/index.ts', 'src/database/index.ts', 'src/cache/index.ts', 'src/storage/index.ts'],
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

/**
 * `declare module` augments a package without importing it, so knip sees no reference and reports the
 * dependency as unused. Dropping it breaks the augmentation: TS2664 with every augmented member gone.
 */
const PACKAGE_IGNORED_DEPENDENCIES: Record<string, string[]> = {
  'packages/modules': ['fastify'],
};

/** `packages/web` and `packages/ui` colocate their unit tests beside the source rather than under `tests/`. */
const COLOCATED_TESTS = ['src/**/*.{test,spec}.{ts,tsx}'];

/** Reached by the runtime or the build, never by an import: bun entrypoints, vite configs, and the test tree. */
const SERVER_ENTRIES = ['src/main.ts', 'src/worker.ts', 'src/migrate.ts', 'src/dump-openapi.ts', 'tests/**/*.ts', 'drizzle.config.ts'];

/**
 * Route modules are discovered by TanStack Router's generator, service workers by a second vite build, and
 * `main.ts`/`serve.ts` by `bun start` — none of them appear in any import graph knip can walk.
 */
const WEB_ENTRIES = ['src/routes/**/*.tsx', 'src/routes/**/*.ts', 'src/service-worker.ts', 'src/sw.ts', 'vitest.config.ts', 'tests/**/*.{ts,tsx}'];

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['scripts/*.ts', 'scripts/utils/*.ts', 'scripts/evals/*/*.ts', '*.config.ts'],
      project: ['scripts/**/*.ts', '*.config.ts'],
      /**
       * `scripts/build.ts` loads the whole bundler toolchain through `import(name)` over a string array, and
       * `scripts/code-health.ts` resolves its analyzers as binaries — neither is an import knip can follow.
       */
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
          entry: existing(dir, SERVER_ENTRIES),
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
  /** Spawned by path from another workspace's directory, never imported: `scripts/*.ts` and the e2e seed entry. */
  ignoreUnresolved: [/^scripts\//, 'seed/seed.ts'],
};

export default config;
