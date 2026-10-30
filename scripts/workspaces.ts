import path from 'node:path';

import { type PackageExport, type PackageJson, readPackageJson, ShadowError } from './utils/index.ts';

export type WorkspaceType = 'library' | 'component' | 'backend' | 'spa' | 'ssr' | 'none';

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

export interface DbOptions {
  /** Drizzle schema entry, workspace-relative. Default `src/database/schemas/index.ts`. */
  schema?: string;
}

export interface ClientContract {
  /** Repo-relative server workspace whose OpenAPI document the contract is cut from, e.g. `apps/pulse-server`. */
  server: string;
  /** OpenAPI path keys kept in the contract; a trailing `*` keeps every path with that prefix. */
  paths: string[];
}

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
  css?: CssOptions;
  /** Run the delegated `test` step during `verify`. Defaults to false for web apps and `none`-type workspaces, true otherwise. */
  verifyTest?: boolean;
  db?: DbOptions;
  /** Server-to-server contracts generated into `src/<name>/<name>-api.gen.ts` by `scripts/gen-clients.ts`, keyed by `<name>`. */
  clientContracts?: Record<string, ClientContract>;
}

export interface Workspace {
  name: string;
  dir: string;
  path: string;
  type: WorkspaceType;
  packageJson: PackageJson;
  shadow: ShadowOptions;
  exports: Record<string, string>;
  verifyTest: boolean;
  dependencies: string[];
}

export const REPO_ROOT = path.resolve(import.meta.dir, '..');

export const OUT_DIR = 'dist';

export const BACKEND_ENTRY = 'src/main.ts';

export const MIGRATIONS_DIR = 'generated/drizzle';

export const API_TYPES_PATH = 'src/lib/apis/api-types.gen.ts';

const WORKSPACE_PROTOCOL = 'workspace:';

const WEB_TYPES = new Set<WorkspaceType>(['spa', 'ssr']);

// An allowlist, not "has any dot": module bases like `services/config.service` contain dots.
const ASSET_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less', 'json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'woff', 'woff2', 'ttf', 'otf', 'eot']);

export function isAssetBase(base: string): boolean {
  const ext = /\.([a-z0-9]+)$/i.exec(base)?.[1]?.toLowerCase();
  return ext !== undefined && ASSET_EXTENSIONS.has(ext);
}

function toExportBase(target: string): string {
  return target
    .replace(/^\.\//, '')
    .replace(new RegExp(`^${OUT_DIR}/`), '')
    .replace(/\.(?:d\.ts|js)$/, '');
}

export function deriveExports(packageJson: PackageJson): Record<string, string> {
  const entries = Object.entries(packageJson.exports ?? {});
  return Object.fromEntries(
    entries.map(([subpath, target]: [string, PackageExport]) => [subpath, toExportBase(typeof target === 'string' ? target : (target.default ?? target.types ?? ''))]),
  );
}

function hasDependency(packageJson: PackageJson, name: string): boolean {
  return Boolean(packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name] ?? packageJson.peerDependencies?.[name]);
}

export function inferType(dir: string, packageJson: PackageJson, exportsMap: Record<string, string>): WorkspaceType {
  if (dir.startsWith('apps/')) {
    if (dir.endsWith('-server')) return 'backend';
    if (dir.endsWith('-web')) return hasDependency(packageJson, '@tanstack/react-start') ? 'ssr' : 'spa';
    throw new ShadowError(`Cannot infer a type for "${dir}" — an app directory must end in "-server" or "-web", or declare "shadow": { "type": ... } in its package.json`);
  }

  if (dir.startsWith('packages/')) return Object.values(exportsMap).some(isAssetBase) ? 'component' : 'library';
  return 'none';
}

function readShadowOptions(dir: string, packageJson: PackageJson): ShadowOptions {
  const raw = packageJson.shadow;
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ShadowError(`The "shadow" key in ${dir}/package.json must be an object`);
  return raw as ShadowOptions;
}

function collectWorkspaceDependencies(packageJson: PackageJson): string[] {
  const sections = [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies];
  const names = sections.flatMap(section =>
    Object.entries(section ?? {})
      .filter(([, spec]) => spec.startsWith(WORKSPACE_PROTOCOL))
      .map(([name]) => name),
  );
  return Array.from(new Set(names));
}

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

export function findWorkspace(identifier: string, workspaces = findWorkspaces()): Workspace {
  const normalized = identifier.replace(/^\.\//, '').replace(/\/+$/, '');
  const match = workspaces.find(workspace => workspace.dir === normalized || workspace.name === normalized);
  if (!match) throw new ShadowError(`Unknown workspace "${identifier}". Known workspaces:\n${workspaces.map(workspace => `  ${workspace.dir}`).join('\n')}`);
  return match;
}

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

// Level N depends only on lower levels, so a level can build in parallel. Dependencies outside `workspaces` are ignored.
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
