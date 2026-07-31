/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { ShadowError } from '@lib/utils';

/**
 * Defining types
 */
/**
 * What a repo is, which decides how `shadow build` builds it (and whether `shadow release` applies):
 *  - `library`   — a published package → `tsc` + `tsc-alias` (or a custom bundler) to a flat `dist/` with exports; releasable.
 *  - `component` — a published React component library with CSS Modules → a Rollup + PostCSS build (`shadow init` installs the
 *                  bundler stack); releasable.
 *  - `backend`   — a runnable service → a single-file, tree-shaken `Bun.build` bundle (`bun dist/main.js`); not released.
 *  - `spa`       — a client React app → the repo's `vite build`; not released.
 *  - `ssr`       — a server-rendered React app → the repo's `vite build` (server + client); not released.
 */
export type RepoType = 'library' | 'component' | 'backend' | 'spa' | 'ssr';

export interface BuildConfig {
  /**
   * Public subpath → source-relative base. An extensionless base (`"errors/index"`) is a JS module and gets
   * `{ types, default }` conditions plus a `typesVersions` entry; a base with an extension (`"styles.css"`) is a
   * raw asset emitted by a custom `command` and is exported as-is. E.g. `{ ".": "index", "./styles.css": "styles.css" }`.
   */
  exports: Record<string, string>;
  /**
   * Escape hatch: a bundler invocation (tsup/vite/rollup) that replaces the default `tsc` + `tsc-alias` compile —
   * for component libraries whose build needs CSS Modules, `'use client'` banners, or asset extraction that `tsc`
   * can't do. It must emit into `outDir`; shadow still synthesizes `dist/package.json` around its output. A string
   * is split on whitespace (`"tsup"`, `"vite build"`); an array is passed through verbatim for quoted arguments.
   */
  command?: string | string[];
  /** Binary name → source-relative base. Normalized from the `.shadowrc.json` string shorthand or map. */
  bin?: Record<string, string>;
  /** Output directory, relative to the repo root. */
  outDir: string;

  // --- `backend` type only (Bun.build) ---
  /** Main entrypoint for a backend bundle, relative to the repo root. Defaults to `src/main.ts`. */
  entry?: string;
  /** Additional backend entrypoints bundled alongside `entry` (e.g. a migration runner). */
  entries?: string[];
  /** Extra files/dirs copied verbatim into the output (e.g. `generated/drizzle` migrations). */
  assets?: string[];
  /** Minify the backend bundle. Identifier minification is always off (it would break reflect-metadata DI). Defaults to true. */
  minify?: boolean;
  /** Bun.build target for a backend bundle. Defaults to `bun`. */
  target?: 'bun' | 'node';

  // --- `component` type only (Rollup + PostCSS) ---
  /** CSS Modules / stylesheet options for a component-library build. */
  css?: CssBuildConfig;
  /** Import-alias prefix → source-relative dir for the Rollup bundle, e.g. `{ "@/": "src/" }` (mirror the tsconfig `paths`). */
  alias?: Record<string, string>;
}

/** Which runtime globals the lint config treats as defined — a Node library, a browser library, or both. */
export type GlobalsEnv = 'node' | 'browser' | 'both';

/** CSS Modules / stylesheet options for a `component` build (Rollup + PostCSS). Every field has a default matching the ecosystem's UI library. */
export interface CssBuildConfig {
  /** CSS Modules scoped-name template. Default `sh-[local]_[hash:base64:5]`. */
  scopedName?: string;
  /** Filename the extracted CSS is written to, under the output dir. Default `styles.css`. */
  extract?: string;
  /** When set, also emit `<extract-basename>.layer.css` wrapping the CSS in `@layer <name>` so consumers can de-prioritize it. */
  layer?: string;
  /** Minify the extracted CSS. Default true. */
  minify?: boolean;
  /** Source globs whose emitted module gets a `'use client'` banner (RSC). Defaults to every `.tsx` module. */
  useClient?: string[];
}

/** A file-scoped rule override a consuming repo layers onto the shipped flat config (e.g. relax rules for colocated tests). */
export interface LintOverride {
  /** Flat-config `files` globs the rules apply to, e.g. story or fixture file patterns. */
  files: string[];
  /** ESLint rules applied to the matched files. */
  rules: Record<string, unknown>;
}

export interface LintConfig {
  /** ESLint rules merged over the shipped base flat config — the escape hatch for per-repo rule tweaks. */
  rules: Record<string, unknown>;
  /** Extra ignore globs appended to the shipped defaults. */
  ignores: string[];
  /** File-scoped rule overrides layered after the base config, for cases a flat `rules` map can't express. */
  overrides: LintOverride[];
  /** Which runtime globals to treat as defined. Unset means `verify` picks a default from the repo type (browser for a web app, both for SSR, else node). */
  globals?: GlobalsEnv;
  /** Enable the React/JSX lint rules on `.tsx`. Left unset means auto-detect from a `react` dependency (resolved by `verify`). */
  react?: boolean;
  /** React version handed to `eslint-plugin-react` (its `'detect'` mode throws under ESLint 10). Unset means resolve from the repo's `react` dependency. */
  reactVersion?: string;
}

export interface CommitConfig {
  /** commitlint configs to extend — replaced (not merged) by a `.shadowrc.json` override. */
  extends: string[];
  /** commitlint rules merged over the extended config. */
  rules: Record<string, unknown>;
}

export interface VerifyConfig {
  lint: LintConfig;
  /** Commit-message linting config, applied by `shadow commit-msg`. */
  commit: CommitConfig;
  /** Glob of files lint covers, relative to the repo root. */
  lintFiles: string;
  /** Glob of files format covers, relative to the repo root — split from lint so a repo can format a dir it doesn't lint. */
  formatFiles: string;
  /** Run the delegated `test` step during `verify`. Set false for a lighter pre-commit that leaves tests to CI. */
  test: boolean;
}

export interface ReleaseConfig {
  /** Publish the built package to npm after tagging. */
  npm: boolean;
  /** Directory published to npm (the build output), relative to the repo root. */
  publishDir: string;
  /** Prepend a generated changelog section to the GitHub release body. */
  changelog: boolean;
}

export interface GenApiTypesConfig {
  /** Output path for generated API types, relative to the repo root. */
  outputPath: string;
}

export interface CheckMigrationsConfig {
  /** Migrations directory checked for drift, relative to the repo root. */
  dir: string;
}

export interface ShadowConfig {
  /** What the repo is — drives how `shadow build` builds it and whether `shadow release` applies. */
  type: RepoType;
  build: BuildConfig;
  verify: VerifyConfig;
  release: ReleaseConfig;
  genApiTypes: GenApiTypesConfig;
  checkMigrations: CheckMigrationsConfig;
}

/** The raw, fully-optional shape a user writes in `.shadowrc.json`. Every field is narrowed and defaulted by {@link loadConfig}. */
export interface RawShadowConfig {
  type?: RepoType;
  build?: {
    exports?: Record<string, string>;
    command?: string | string[];
    bin?: string | Record<string, string>;
    outDir?: string;
    entry?: string;
    entries?: string[];
    assets?: string[];
    minify?: boolean;
    target?: 'bun' | 'node';
    css?: CssBuildConfig;
    alias?: Record<string, string>;
  };
  verify?: {
    lint?: { rules?: Record<string, unknown>; ignores?: string[]; overrides?: LintOverride[]; globals?: GlobalsEnv; react?: boolean; reactVersion?: string };
    commit?: { extends?: string[]; rules?: Record<string, unknown> };
    /** One glob shared by lint + format, or `{ lint, format }` to cover different file sets. */
    files?: string | { lint?: string; format?: string };
    test?: boolean;
  };
  release?: { npm?: boolean; publishDir?: string; changelog?: boolean };
  genApiTypes?: { outputPath?: string };
  checkMigrations?: { dir?: string };
}

/**
 * Declaring the constants
 */
const CONFIG_FILENAME = '.shadowrc.json';

/** The valid repo types, in the order presented by `shadow init`'s prompt. */
export const REPO_TYPES: RepoType[] = ['library', 'component', 'backend', 'spa', 'ssr'];

/** Narrows an arbitrary string to a {@link RepoType} — used to validate the `--type` flag and the init prompt. */
export function isRepoType(value: string): value is RepoType {
  return (REPO_TYPES as string[]).includes(value);
}

/**
 * The build tooling each repo type needs, installed into the repo by `shadow init` (not shipped in shadow's own
 * dependencies) — so a backend never pulls the CSS/Rollup stack and every repo installs only what its type builds
 * with. `backend` uses Bun's built-in bundler and `spa`/`ssr` bring their own Vite, so only `component` needs any.
 */
export const TYPE_DEPENDENCIES: Record<RepoType, string[]> = {
  library: [],
  component: [
    'rollup',
    '@rollup/plugin-alias',
    '@rollup/plugin-node-resolve',
    'rollup-plugin-esbuild',
    'esbuild',
    'rollup-plugin-postcss',
    'postcss',
    'postcss-import',
    'rollup-plugin-banner2',
    'cssnano',
  ],
  backend: [],
  spa: [],
  ssr: [],
};

/** Base commitlint config the shipped commit-message linting extends. Overridable via `.shadowrc.json` `verify.commit`. */
export const COMMITLINT_BASE_EXTENDS = ['@commitlint/config-conventional'];

/** Default file glob lint + format cover — includes `.tsx` so component libraries are checked out of the box. */
const DEFAULT_FILES = '{src,tests,scripts}/**/*.{ts,tsx}';

const DEFAULT_CONFIG: ShadowConfig = {
  type: 'library',
  build: { exports: { '.': 'index' }, outDir: 'dist' },
  verify: {
    lint: { rules: {}, ignores: [], overrides: [] },
    commit: { extends: COMMITLINT_BASE_EXTENDS, rules: {} },
    lintFiles: DEFAULT_FILES,
    formatFiles: DEFAULT_FILES,
    test: true,
  },
  release: { npm: true, publishDir: 'dist', changelog: true },
  genApiTypes: { outputPath: 'src/lib/apis/api-types.gen.ts' },
  checkMigrations: { dir: 'generated/drizzle' },
};

/**
 * Normalizes a `.shadowrc.json` `bin` field (string shorthand or name→path map) to a map keyed by binary
 * name, of source-relative bases — the same shape the `exports` map uses. Returns undefined when unset.
 */
function normalizeBin(bin: string | Record<string, string> | undefined, packageName: string | undefined): Record<string, string> | undefined {
  if (!bin) return undefined;
  if (typeof bin === 'object') return bin;
  const derivedName = packageName?.replace(/^@[^/]+\//, '');
  if (!derivedName) throw new ShadowError('build.bin is a string but package.json has no "name" to derive the binary name from');
  return { [derivedName]: bin };
}

/** Reads and parses `<dir>/.shadowrc.json` if present, failing with a diagnostic on invalid JSON. Absent file → empty config. */
export function readRawConfig(cwd: string): RawShadowConfig {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as RawShadowConfig;
  } catch (cause) {
    throw new ShadowError(`Failed to parse ${configPath}: not valid JSON`, { cause });
  }
}

/**
 * Loads `.shadowrc.json` from `cwd`, layering it over {@link DEFAULT_CONFIG} to produce a fully-resolved
 * config — the single source of truth every command reads from. `packageName` is only needed to derive a
 * binary name from a string `build.bin` shorthand.
 */
export function loadConfig(cwd: string, packageName?: string): ShadowConfig {
  const raw = readRawConfig(cwd);
  const exportsConfig = raw.build?.exports ?? DEFAULT_CONFIG.build.exports;

  const rawFiles = raw.verify?.files;
  const lintFiles = typeof rawFiles === 'string' ? rawFiles : (rawFiles?.lint ?? DEFAULT_CONFIG.verify.lintFiles);
  const formatFiles = typeof rawFiles === 'string' ? rawFiles : (rawFiles?.format ?? DEFAULT_CONFIG.verify.formatFiles);

  return {
    type: raw.type ?? DEFAULT_CONFIG.type,
    build: {
      exports: exportsConfig,
      command: raw.build?.command,
      bin: normalizeBin(raw.build?.bin, packageName),
      outDir: raw.build?.outDir ?? DEFAULT_CONFIG.build.outDir,
      entry: raw.build?.entry,
      entries: raw.build?.entries,
      assets: raw.build?.assets,
      minify: raw.build?.minify,
      target: raw.build?.target,
      css: raw.build?.css,
      alias: raw.build?.alias,
    },
    verify: {
      lint: {
        rules: { ...DEFAULT_CONFIG.verify.lint.rules, ...raw.verify?.lint?.rules },
        ignores: [...DEFAULT_CONFIG.verify.lint.ignores, ...(raw.verify?.lint?.ignores ?? [])],
        overrides: raw.verify?.lint?.overrides ?? DEFAULT_CONFIG.verify.lint.overrides,
        globals: raw.verify?.lint?.globals,
        react: raw.verify?.lint?.react,
        reactVersion: raw.verify?.lint?.reactVersion,
      },
      commit: {
        extends: raw.verify?.commit?.extends ?? DEFAULT_CONFIG.verify.commit.extends,
        rules: { ...DEFAULT_CONFIG.verify.commit.rules, ...raw.verify?.commit?.rules },
      },
      lintFiles,
      formatFiles,
      test: raw.verify?.test ?? DEFAULT_CONFIG.verify.test,
    },
    release: {
      npm: raw.release?.npm ?? DEFAULT_CONFIG.release.npm,
      publishDir: raw.release?.publishDir ?? DEFAULT_CONFIG.release.publishDir,
      changelog: raw.release?.changelog ?? DEFAULT_CONFIG.release.changelog,
    },
    genApiTypes: { outputPath: raw.genApiTypes?.outputPath ?? DEFAULT_CONFIG.genApiTypes.outputPath },
    checkMigrations: { dir: raw.checkMigrations?.dir ?? DEFAULT_CONFIG.checkMigrations.dir },
  };
}
