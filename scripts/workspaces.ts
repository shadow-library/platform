/**
 * Importing npm packages
 */
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { type PackageExport, type PackageJson, readPackageJson, ShadowError } from './utils/index.ts';

/**
 * Defining types
 */
/**
 * What a workspace is, which decides how `build.ts` builds it:
 *  - `library`   — a package consumed by other workspaces → `tsc` + `tsc-alias` into a flat `dist/` with exports.
 *  - `component` — a React component library with CSS Modules → a Rollup + PostCSS build.
 *  - `backend`   — a runnable service → a single-file, tree-shaken `Bun.build` bundle (`bun dist/main.js`).
 *  - `spa`       — a client React app → the workspace's `vite build`.
 *  - `ssr`       — a server-rendered React app → the workspace's `vite build` (server + client).
 *  - `none`      — nothing to build (the `e2e` suite).
 */
export type WorkspaceType = 'library' | 'component' | 'backend' | 'spa' | 'ssr' | 'none';

/** CSS Modules / stylesheet options for a `component` build. Every field defaults to the ecosystem UI library's setting. */
export interface CssOptions {
  /** CSS Modules scoped-name template. Default `sh-[local]_[hash:base64:5]`. */
  scopedName?: string;
  /** Filename the extracted CSS is written to, under `dist/`. Default `styles.css`. */
  extract?: string;
  /** When set, also emit `<extract-basename>.layer.css` wrapping the CSS in `@layer <name>` so consumers can de-prioritize it. */
  layer?: string;
  /** Minify the extracted CSS. Default true. */
  minify?: boolean;
  /** Source globs whose emitted module gets a `'use client'` banner (RSC). Defaults to every `.tsx` module. */
  useClient?: string[];
}

/**
 * The optional `"shadow"` key in a workspace's own `package.json` — the escape hatch for the handful of
 * build inputs that genuinely cannot be inferred from the workspace's path, dependencies, or `exports`.
 * A workspace with nothing non-derivable carries no `"shadow"` key at all.
 */
export interface ShadowOptions {
  /** Overrides the inferred {@link WorkspaceType} — for a workspace whose path breaks the naming convention. */
  type?: WorkspaceType;
  /** Additional backend entrypoints bundled alongside `src/main.ts` (e.g. a migration runner). */
  entries?: string[];
  /** Extra files/dirs copied verbatim into `dist/` (e.g. `generated/drizzle` migrations). */
  assets?: string[];
  /** A bundler invocation replacing the default compile step. A string is split on whitespace; an array is passed through verbatim. */
  command?: string | string[];
  /** Import-alias prefix → workspace-relative dir for the component Rollup bundle, e.g. `{ "@/": "src/" }` (mirror the tsconfig `paths`). */
  alias?: Record<string, string>;
  /** CSS Modules / stylesheet options for a `component` build. */
  css?: CssOptions;
  /** Run the delegated `test` step during `verify`. Defaults to false for web apps and `none`-type workspaces, true otherwise. */
  verifyTest?: boolean;
}

export interface Workspace {
  /** The `package.json` name, e.g. `@shadow-library/common`. */
  name: string;
  /** Repo-relative directory, e.g. `packages/common` — the identifier every entrypoint takes on the command line. */
  dir: string;
  /** Absolute directory. */
  path: string;
  type: WorkspaceType;
  packageJson: PackageJson;
  shadow: ShadowOptions;
  /** Public subpath → source-relative base, derived from the `package.json` `exports` field. */
  exports: Record<string, string>;
  /** Whether `verify` runs the workspace's `test` script. */
  verifyTest: boolean;
  /** Names of the first-party workspaces this one depends on (`workspace:*` specs). */
  dependencies: string[];
}

/**
 * Declaring the constants
 */
/** The monorepo root — `scripts/` sits directly below it, so this holds wherever the repo is checked out. */
export const REPO_ROOT = path.resolve(import.meta.dir, '..');

/** Output directory for every buildable workspace. Uniform by convention; there is no per-workspace override. */
export const OUT_DIR = 'dist';

/** Main entrypoint of a `backend` bundle, relative to the workspace root. */
export const BACKEND_ENTRY = 'src/main.ts';

/** Where `check-migrations.ts` expects drizzle to emit, relative to the workspace root. */
export const MIGRATIONS_DIR = 'generated/drizzle';

/** Where `gen-api-types.ts` writes generated API types in a web workspace, relative to the workspace root. */
export const API_TYPES_PATH = 'src/lib/apis/api-types.gen.ts';

/** The dependency spec prefix bun uses for a first-party workspace link. */
const WORKSPACE_PROTOCOL = 'workspace:';

/** Web-app types — they build through Vite and skip tests during `verify` unless a workspace opts back in. */
const WEB_TYPES = new Set<WorkspaceType>(['spa', 'ssr']);

/**
 * Known static-asset extensions an `exports` entry may point at. Matched against an *allowlist* rather
 * than "has any dot" because a JS-module base can legitimately contain dots — this ecosystem names files
 * `*.service.ts`, `*.controller.ts`, `*.dto.ts`, so `services/config.service` is a module, not an asset.
 */
const ASSET_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less', 'json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'woff', 'woff2', 'ttf', 'otf', 'eot']);

/**
 * True when an export base is a raw asset (`styles.css`) rather than a JS module (`errors/index`,
 * `services/config.service`). Assets are exported as-is, with no `types`/`default` conditions.
 */
export function isAssetBase(base: string): boolean {
  const ext = /\.([a-z0-9]+)$/i.exec(base)?.[1]?.toLowerCase();
  return ext !== undefined && ASSET_EXTENSIONS.has(ext);
}

/** Strips the `./` and `dist/` prefixes and any `.js`/`.d.ts` extension from an `exports` target, yielding a source-relative base. */
function toExportBase(target: string): string {
  return target
    .replace(/^\.\//, '')
    .replace(new RegExp(`^${OUT_DIR}/`), '')
    .replace(/\.(?:d\.ts|js)$/, '');
}

/**
 * Derives the build's subpath → source-relative base map from the workspace's published `exports` field,
 * so the two can never drift: `{ ".": { "default": "./dist/index.js" } }` → `{ ".": "index" }`, and a raw
 * asset target (`"./dist/styles.css"`) keeps its extension so the build knows not to compile it.
 */
export function deriveExports(packageJson: PackageJson): Record<string, string> {
  const entries = Object.entries(packageJson.exports ?? {});
  return Object.fromEntries(
    entries.map(([subpath, target]: [string, PackageExport]) => [subpath, toExportBase(typeof target === 'string' ? target : (target.default ?? target.types ?? ''))]),
  );
}

/** Whether any dependency section declares `name`. */
function hasDependency(packageJson: PackageJson, name: string): boolean {
  return Boolean(packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name] ?? packageJson.peerDependencies?.[name]);
}

/**
 * Infers what a workspace is from where it lives and what it depends on — the convention that replaced
 * a per-workspace config file. Apps are named for their role (`*-server` builds as a service, `*-web` as
 * a Vite app, SSR when TanStack Start is present); a package that publishes a stylesheet is a component
 * library, any other package is a plain library; everything else has nothing to build.
 */
export function inferType(dir: string, packageJson: PackageJson, exportsMap: Record<string, string>): WorkspaceType {
  if (dir.startsWith('apps/')) {
    if (dir.endsWith('-server')) return 'backend';
    if (dir.endsWith('-web')) return hasDependency(packageJson, '@tanstack/react-start') ? 'ssr' : 'spa';
    throw new ShadowError(`Cannot infer a type for "${dir}" — an app directory must end in "-server" or "-web", or declare "shadow": { "type": ... } in its package.json`);
  }

  if (dir.startsWith('packages/')) return Object.values(exportsMap).some(isAssetBase) ? 'component' : 'library';
  return 'none';
}

/** Reads the workspace's optional `"shadow"` package.json key, rejecting a non-object value outright. */
function readShadowOptions(dir: string, packageJson: PackageJson): ShadowOptions {
  const raw = packageJson.shadow;
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ShadowError(`The "shadow" key in ${dir}/package.json must be an object`);
  return raw as ShadowOptions;
}

/** Names of the first-party workspaces `packageJson` links to — the edges of the build graph. */
function collectWorkspaceDependencies(packageJson: PackageJson): string[] {
  const sections = [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies];
  const names = sections.flatMap(section =>
    Object.entries(section ?? {})
      .filter(([, spec]) => spec.startsWith(WORKSPACE_PROTOCOL))
      .map(([name]) => name),
  );
  return Array.from(new Set(names));
}

/** Builds the resolved {@link Workspace} for a repo-relative directory. */
function loadWorkspace(dir: string): Workspace {
  const absolute = path.join(REPO_ROOT, dir);
  const packageJson = readPackageJson(absolute);
  const name = packageJson.name;
  if (!name) throw new ShadowError(`${dir}/package.json has no "name"`);

  const shadow = readShadowOptions(dir, packageJson);
  const exportsMap = deriveExports(packageJson);
  const type = shadow.type ?? inferType(dir, packageJson, exportsMap);

  return {
    name,
    dir,
    path: absolute,
    type,
    packageJson,
    shadow,
    exports: exportsMap,
    verifyTest: shadow.verifyTest ?? !(WEB_TYPES.has(type) || type === 'none'),
    dependencies: collectWorkspaceDependencies(packageJson),
  };
}

/**
 * Discovers every workspace from the root `package.json` `workspaces` globs, sorted by directory so
 * output ordering is stable across machines. This is the single source of truth every script reads —
 * adding a workspace to the monorepo is enough to make the tooling pick it up.
 */
export function findWorkspaces(): Workspace[] {
  const root = readPackageJson(REPO_ROOT);
  const globs = root.workspaces;
  if (!globs?.length) throw new ShadowError(`${REPO_ROOT}/package.json declares no "workspaces"`);

  const dirs = new Set<string>();
  for (const glob of globs) {
    for (const match of new Bun.Glob(`${glob}/package.json`).scanSync({ cwd: REPO_ROOT, onlyFiles: true })) dirs.add(path.dirname(match));
  }

  return Array.from(dirs)
    .sort()
    .map(dir => loadWorkspace(dir));
}

/**
 * Resolves a command-line workspace identifier — its repo-relative directory (`packages/common`) or its
 * package name (`@shadow-library/common`) — against the discovered set, listing the valid ones on a miss.
 */
export function findWorkspace(identifier: string, workspaces = findWorkspaces()): Workspace {
  const normalized = identifier.replace(/^\.\//, '').replace(/\/+$/, '');
  const match = workspaces.find(workspace => workspace.dir === normalized || workspace.name === normalized);
  if (!match) throw new ShadowError(`Unknown workspace "${identifier}". Known workspaces:\n${workspaces.map(workspace => `  ${workspace.dir}`).join('\n')}`);
  return match;
}

/**
 * Every first-party workspace `workspace` depends on, transitively, excluding itself. CI builds exactly
 * this closure before verifying a workspace, so each `workspace:*` import resolves to a real `dist/`
 * without building the whole repo — the dependency-closure selector bun's `--filter` doesn't offer.
 */
export function transitiveDependencies(workspace: Workspace, workspaces = findWorkspaces()): Workspace[] {
  const byName = new Map(workspaces.map(candidate => [candidate.name, candidate]));
  const collected = new Map<string, Workspace>();

  const visit = (current: Workspace): void => {
    for (const name of current.dependencies) {
      const dependency = byName.get(name);
      if (!dependency || collected.has(name)) continue;
      collected.set(name, dependency);
      visit(dependency);
    }
  };

  visit(workspace);
  return [...collected.values()];
}

/**
 * Groups `workspaces` into dependency levels: every workspace in level N depends only on workspaces in
 * levels below it, so a level can be built entirely in parallel. Replaces bun's `--filter` ordering,
 * which the root scripts no longer go through. Dependencies outside `workspaces` are ignored, so a
 * subset (or a single workspace) sorts cleanly.
 */
export function topologicalLevels(workspaces: Workspace[]): Workspace[][] {
  const included = new Set(workspaces.map(workspace => workspace.name));
  const pending = new Map(workspaces.map(workspace => [workspace.name, workspace.dependencies.filter(dependency => included.has(dependency))]));

  const levels: Workspace[][] = [];
  const resolved = new Set<string>();

  while (pending.size > 0) {
    const level = workspaces.filter(workspace => pending.has(workspace.name) && (pending.get(workspace.name) as string[]).every(dependency => resolved.has(dependency)));
    if (level.length === 0) throw new ShadowError(`Dependency cycle between workspaces: ${Array.from(pending.keys()).join(', ')}`);

    for (const workspace of level) {
      pending.delete(workspace.name);
      resolved.add(workspace.name);
    }
    levels.push(level);
  }

  return levels;
}
