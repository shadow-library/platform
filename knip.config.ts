/**
 * Importing npm packages
 */
import { type KnipConfig } from 'knip';

/**
 * Declaring the constants
 */
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
  'packages/modules': ['src/index.ts', 'src/http-core/index.ts', 'src/database/index.ts', 'src/cache/index.ts', 'src/storage/index.ts'],
  'packages/sdk': ['src/index.ts', 'src/publishing/index.ts'],
  'packages/ui': ['src/index.ts', 'src/router.ts', 'src/router.tsx'],
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

/** `packages/web` and `packages/ui` colocate their unit tests beside the source rather than under `tests/`. */
const COLOCATED_TESTS = ['src/**/*.{test,spec}.{ts,tsx}'];

/** Reached by the runtime or the build, never by an import: bun entrypoints, vite configs, and the test tree. */
const SERVER_ENTRIES = ['src/main.ts', 'src/worker.ts', 'src/migrate.ts', 'tests/**/*.ts', 'drizzle.config.ts'];

/**
 * Route modules are discovered by TanStack Router's generator, service workers by a second vite build, and
 * `main.ts`/`serve.ts` by `bun start` — none of them appear in any import graph knip can walk.
 */
const WEB_ENTRIES = [
  'src/router.tsx',
  'src/routes/**/*.tsx',
  'src/routes/**/*.ts',
  'src/routeTree.gen.ts',
  'src/service-worker.ts',
  'src/sw.ts',
  'main.ts',
  'serve.ts',
  'vite.config.ts',
  'vite.sw.config.ts',
  'vitest.config.ts',
  'tests/**/*.{ts,tsx}',
];

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['scripts/*.ts', 'scripts/utils/*.ts', '*.config.ts'],
      project: ['scripts/**/*.ts', '*.config.ts'],
      /** `scripts/build.ts` loads the whole bundler toolchain through `import(name)` over a string array, which knip cannot follow. */
      ignoreDependencies: [
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
    /** `drizzle-kit` is never imported — `scripts/db.ts` resolves its binary out of the workspace that owns the schema. */
    'apps/*-server': { entry: SERVER_ENTRIES, project: ['src/**/*.ts', 'tests/**/*.ts'], ignoreDependencies: ['drizzle-kit'] },
    'apps/*-web': { entry: WEB_ENTRIES, project: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.ts'] },
    ...Object.fromEntries(
      Object.entries(PACKAGE_ENTRIES).map(([dir, entry]) => [
        dir,
        {
          entry: [...entry, ...COLOCATED_TESTS, 'tests/**/*.{ts,tsx}', '*.config.ts', '.storybook/*.{ts,tsx}'],
          project: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.config.ts'],
        },
      ]),
    ),
    e2e: { entry: ['tests/**/*.ts', 'seed/**/*.ts', 'playwright.config.ts'], project: ['**/*.ts'] },
  },
  ignore: ['**/*.gen.ts', '**/dist/**', '**/generated/**', '**/*.stories.tsx'],
  ignoreDependencies: ['@types/*'],
  ignoreBinaries: ['docker', 'psql'],
};

export default config;
