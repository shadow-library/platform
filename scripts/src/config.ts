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
export interface BuildConfig {
  /** Public subpath → source-relative base (no extension), e.g. `{ ".": "index", "./errors": "errors/index" }`. */
  exports: Record<string, string>;
  /** Binary name → source-relative base. Normalized from the `.shadowrc.json` string shorthand or map. */
  bin?: Record<string, string>;
  /** Output directory, relative to the repo root. */
  outDir: string;
}

export interface LintConfig {
  /** ESLint rules merged over the shipped base flat config — the escape hatch for per-repo rule tweaks. */
  rules: Record<string, unknown>;
  /** Extra ignore globs appended to the shipped defaults. */
  ignores: string[];
}

/** Prettier options merged over {@link PRETTIER_BASE}. Kept open — every prettier option is a valid override. */
export type FormatConfig = Record<string, unknown>;

export interface CommitConfig {
  /** commitlint configs to extend — replaced (not merged) by a `.shadowrc.json` override. */
  extends: string[];
  /** commitlint rules merged over the extended config. */
  rules: Record<string, unknown>;
}

export interface VerifyConfig {
  lint: LintConfig;
  format: FormatConfig;
  /** Commit-message linting config, applied by `shadow commit-msg`. */
  commit: CommitConfig;
  /** Glob of files lint + format cover, relative to the repo root. */
  files: string;
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
  build: BuildConfig;
  verify: VerifyConfig;
  release: ReleaseConfig;
  genApiTypes: GenApiTypesConfig;
  checkMigrations: CheckMigrationsConfig;
}

/** The raw, fully-optional shape a user writes in `.shadowrc.json`. Every field is narrowed and defaulted by {@link loadConfig}. */
export interface RawShadowConfig {
  build?: {
    exports?: Record<string, string>;
    bin?: string | Record<string, string>;
    outDir?: string;
  };
  verify?: {
    lint?: { rules?: Record<string, unknown>; ignores?: string[] };
    format?: FormatConfig;
    commit?: { extends?: string[]; rules?: Record<string, unknown> };
    files?: string;
  };
  release?: { npm?: boolean; publishDir?: string; changelog?: boolean };
  genApiTypes?: { outputPath?: string };
  checkMigrations?: { dir?: string };
}

/**
 * Declaring the constants
 */
const CONFIG_FILENAME = '.shadowrc.json';

/** Base commitlint config the shipped commit-message linting extends. Overridable via `.shadowrc.json` `verify.commit`. */
export const COMMITLINT_BASE_EXTENDS = ['@commitlint/config-conventional'];

/** Base prettier ruleset. A repo's `verify.format` in `.shadowrc.json` is merged over this, so any option can be overridden. */
export const PRETTIER_BASE: FormatConfig = {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 180,
  arrowParens: 'avoid',
};

const DEFAULT_CONFIG: ShadowConfig = {
  build: { exports: { '.': 'index' }, outDir: 'dist' },
  verify: { lint: { rules: {}, ignores: [] }, format: {}, commit: { extends: COMMITLINT_BASE_EXTENDS, rules: {} }, files: '{src,tests,scripts}/**/*.ts' },
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
  if (!exportsConfig['.']) throw new ShadowError('build.exports must include a "." entry');

  return {
    build: {
      exports: exportsConfig,
      bin: normalizeBin(raw.build?.bin, packageName),
      outDir: raw.build?.outDir ?? DEFAULT_CONFIG.build.outDir,
    },
    verify: {
      lint: {
        rules: { ...DEFAULT_CONFIG.verify.lint.rules, ...raw.verify?.lint?.rules },
        ignores: [...DEFAULT_CONFIG.verify.lint.ignores, ...(raw.verify?.lint?.ignores ?? [])],
      },
      format: { ...DEFAULT_CONFIG.verify.format, ...raw.verify?.format },
      commit: {
        extends: raw.verify?.commit?.extends ?? DEFAULT_CONFIG.verify.commit.extends,
        rules: { ...DEFAULT_CONFIG.verify.commit.rules, ...raw.verify?.commit?.rules },
      },
      files: raw.verify?.files ?? DEFAULT_CONFIG.verify.files,
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
