/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { formatDuration, log, type PackageJson, reportError, resolveBin, run, runAsync, ShadowError } from './utils/index.ts';
import {
  BACKEND_ENTRY,
  type CssOptions,
  findWorkspace,
  findWorkspaces,
  isAssetBase,
  OUT_DIR,
  REPO_ROOT,
  topologicalLevels,
  transitiveDependencies,
  type Workspace,
  type WorkspaceType,
} from './workspaces.ts';

/**
 * Defining types
 */
/** A {@link CssOptions} with every field resolved to its default. */
interface ResolvedCss {
  scopedName: string;
  extract: string;
  minify: boolean;
  useClient: string[];
  layer?: string;
}

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/build.ts [workspace | glob | --all] [--deps]

  workspace   repo-relative directory (packages/common) or package name (@shadow-library/common)
  glob        a pattern matching several workspace directories, e.g. 'packages/*'
  --all       build every buildable workspace, one dependency level at a time, in parallel
  --deps      build the workspace's transitive first-party dependencies instead of the workspace itself`;

/** Files copied verbatim into every built package's output directory. */
const SUPPORTING_FILES = ['README.md', 'LICENSE'];

/** Runtime metadata carried from source `package.json` into a backend bundle's trimmed `dist/package.json`. */
const BACKEND_MANIFEST_KEYS = ['name', 'type', 'version', 'description', 'author', 'license'] as const;

/** The Rollup/PostCSS stack a `component` build dynamically imports — named in the error when one is missing. */
const COMPONENT_DEPENDENCIES = [
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
];

/** A subpath's dist-relative export conditions for the given base (source-relative, no extension, e.g. `errors/index`). ESM only. */
function buildExportConditions(base: string) {
  return { types: `./${base}.d.ts`, default: `./${base}.js` };
}

/**
 * Computes the `package.json` written into the output directory: `main`/`module`/`types`/`exports`
 * synthesis, a `typesVersions` map so subpath types resolve without `exports` support, `sideEffects`
 * and `bin` path rewriting, and the removal of everything that only matters in source (scripts, dev deps).
 */
export function computeDistPackageJson(workspace: Workspace): PackageJson {
  const rootBase = workspace.exports['.'];
  if (!rootBase) throw new ShadowError(`${workspace.dir}/package.json "exports" must include a "." entry`);
  const subpaths = Object.keys(workspace.exports).filter(subpath => subpath !== '.');
  const typeSubpaths = subpaths.filter(subpath => !isAssetBase(workspace.exports[subpath] as string));

  const distPackageJson: PackageJson = structuredClone(workspace.packageJson);
  distPackageJson.type = 'module';
  distPackageJson.main = `./${rootBase}.js`;
  distPackageJson.module = `./${rootBase}.js`;
  distPackageJson.types = `./${rootBase}.d.ts`;
  distPackageJson.exports = {
    ...Object.fromEntries(Object.entries(workspace.exports).map(([subpath, base]) => [subpath, isAssetBase(base) ? `./${base}` : buildExportConditions(base)])),
    './package.json': './package.json',
  };

  if (typeSubpaths.length > 0) {
    const typesVersions: Record<string, string[]> = {};
    for (const subpath of typeSubpaths) typesVersions[subpath.replace(/^\.\//, '')] = [`./${workspace.exports[subpath]}.d.ts`];
    distPackageJson.typesVersions = { '*': typesVersions };
  }

  // `src/foo.ts` sideEffects entries are source paths and must be rewritten into the output tree;
  // glob patterns (e.g. `**/index.js`) already apply and pass through unchanged.
  if (Array.isArray(distPackageJson.sideEffects)) {
    distPackageJson.sideEffects = distPackageJson.sideEffects.map(entry => {
      if (!entry.startsWith('src/')) return entry;
      return `./${entry.replace(/^src\//, '').replace(/\.ts$/, '.js')}`;
    });
  }

  delete distPackageJson.bin;
  delete distPackageJson.scripts;
  delete distPackageJson.devDependencies;
  delete distPackageJson.shadow;

  return distPackageJson;
}

/**
 * Runs `tsc` then `tsc-alias` into `outDir`. Output is captured (not streamed) and surfaced only through
 * the thrown error on failure — so a compile error is still shown, but a failure never sprays raw
 * `file(line,col): error` lines into CI logs and annotations.
 */
function compileWithTsc(workspace: Workspace, outDir: string): void {
  const tsc = run('bunx', ['tsc', '--outDir', outDir, '--project', 'tsconfig.build.json'], { cwd: workspace.path, stream: false });
  if (tsc.status !== 0) throw new ShadowError(`Build failed: tsc exited with code ${tsc.status}\n${`${tsc.stdout}${tsc.stderr}`.trim()}`);

  const alias = run('bunx', ['tsc-alias', '--outDir', outDir, '--project', 'tsconfig.build.json'], { cwd: workspace.path, stream: false });
  if (alias.status !== 0) throw new ShadowError(`Build failed: tsc-alias exited with code ${alias.status}\n${`${alias.stdout}${alias.stderr}`.trim()}`);
}

/** Splits a `shadow.command` (a whitespace-separated string, or an array passed through verbatim) into a binary and its arguments. */
function splitCommand(command: string | string[]): [string, string[]] {
  const [bin, ...args] = Array.isArray(command) ? command : command.split(/\s+/).filter(Boolean);
  if (!bin) throw new ShadowError('"shadow": { "command": ... } is empty — set it to a bundler invocation like "vite build"');
  return [bin, args];
}

/**
 * Runs a workspace's own bundler (`shadow.command`) in place of the default compile — the escape hatch for
 * builds needing CSS Modules, banners, or asset extraction. Output streams live (a bundler prints its own
 * progress and errors), so on failure the error is terse; the command must emit into `outDir` itself.
 */
function runBuildCommand(workspace: Workspace, command: string | string[]): void {
  const [bin, args] = splitCommand(command);
  const result = run(resolveBin(bin, [workspace.path, REPO_ROOT]), args, { cwd: workspace.path });
  if (result.status !== 0) throw new ShadowError(`Build failed: "${[bin, ...args].join(' ')}" exited with code ${result.status}`);
}

/** Recreates the workspace's output directory, empty. */
function resetDistDir(workspace: Workspace): string {
  const distDir = path.join(workspace.path, OUT_DIR);
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  return distDir;
}

/** Copies `assets` (files or directories, workspace-relative) into `distDir`, skipping any that don't exist. */
function copyAssets(workspace: Workspace, distDir: string, assets: string[]): void {
  for (const asset of assets) {
    const source = path.join(workspace.path, asset);
    if (!fs.existsSync(source)) continue;
    const dest = path.join(distDir, asset);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(source, dest, { recursive: true });
  }
}

/** Writes the synthesized `dist/package.json` and copies README/LICENSE alongside it. */
function writeDistPackage(workspace: Workspace, distDir: string): PackageJson {
  const distPackageJson = computeDistPackageJson(workspace);
  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(distPackageJson, null, 2)}\n`);
  copyAssets(workspace, distDir, SUPPORTING_FILES);
  return distPackageJson;
}

/**
 * The published-library build (tsc + tsc-alias, or a custom `shadow.command`). Emits a single ESM tree
 * with type declarations and subpath exports, synthesizing `dist/package.json` around it.
 */
function buildLibrary(workspace: Workspace): void {
  const distDir = resetDistDir(workspace);

  // Compile first: a custom `shadow.command` bundler may clean the output dir itself, so the synthesized
  // package.json and supporting files are written only after the compile step, to survive it.
  if (workspace.shadow.command) runBuildCommand(workspace, workspace.shadow.command);
  else compileWithTsc(workspace, distDir);

  writeDistPackage(workspace, distDir);

  const tsbuildinfo = path.join(distDir, 'tsconfig.build.tsbuildinfo');
  if (fs.existsSync(tsbuildinfo)) fs.rmSync(tsbuildinfo);
}

/** Writes the trimmed `dist/package.json` for a backend bundle: runtime metadata + `main` + the current git commit. */
function writeBackendManifest(workspace: Workspace, distDir: string, entry: string): void {
  const manifest: PackageJson = {};
  for (const key of BACKEND_MANIFEST_KEYS) {
    const value = workspace.packageJson[key];
    if (value !== undefined) (manifest as Record<string, unknown>)[key] = value;
  }
  manifest.main = `${path.basename(entry).replace(/\.[cm]?tsx?$/, '')}.js`;

  const gitCommit = run('git', ['rev-parse', 'HEAD'], { cwd: workspace.path, stream: false });
  if (gitCommit.status === 0) manifest.gitCommit = gitCommit.stdout.trim();

  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * The backend-service build: a single-file, tree-shaken `Bun.build` bundle runnable with `bun dist/main.js`.
 * Identifier minification stays off so `reflect-metadata`-driven DI keeps working. Bundles any extra
 * `shadow.entries` (e.g. a migration runner) alongside the main entry, copies `shadow.assets` (e.g.
 * `generated/drizzle`) plus README/LICENSE, and writes a trimmed `dist/package.json` — no `dependencies`,
 * since every JS dependency is inlined into the bundle.
 */
async function buildBackend(workspace: Workspace): Promise<void> {
  const distDir = resetDistDir(workspace);

  // One Bun.build per entrypoint: a single entry flattens to `dist/<name>.js`, whereas bundling entries that
  // span `src/` and `scripts/` together would mirror their tree into `dist/`. Each output is standalone.
  for (const relative of [BACKEND_ENTRY, ...(workspace.shadow.entries ?? [])]) {
    const entrypoint = path.join(workspace.path, relative);
    if (!fs.existsSync(entrypoint)) throw new ShadowError(`Build failed: entrypoint does not exist: ${relative}`);
    const result = await Bun.build({ entrypoints: [entrypoint], target: 'bun', outdir: distDir, minify: { whitespace: true, syntax: true, identifiers: false } });
    if (!result.success) throw new ShadowError(`Build failed (${relative}):\n${result.logs.map(String).join('\n')}`);
  }

  writeBackendManifest(workspace, distDir, BACKEND_ENTRY);
  copyAssets(workspace, distDir, [...SUPPORTING_FILES, ...(workspace.shadow.assets ?? [])]);
}

/** Applies the component-build CSS defaults (matching the ecosystem UI library) over the workspace's `shadow.css`. */
function resolveCss(css: CssOptions = {}): ResolvedCss {
  return {
    scopedName: css.scopedName ?? 'sh-[local]_[hash:base64:5]',
    extract: css.extract ?? 'styles.css',
    minify: css.minify ?? true,
    useClient: css.useClient ?? ['**/*.tsx'],
    layer: css.layer,
  };
}

/** Dynamically imports one of the {@link COMPONENT_DEPENDENCIES}, with a clear error when the stack isn't installed. */
async function importBundler(name: string): Promise<Record<string, unknown>> {
  try {
    return (await import(name)) as Record<string, unknown>;
  } catch (cause) {
    throw new ShadowError(`The "component" build needs "${name}" — install the toolchain at the repo root: bun add -D ${COMPONENT_DEPENDENCIES.join(' ')}`, { cause });
  }
}

/** Imports a package's default export (the shape Rollup plugins ship), tolerating CJS/ESM interop. */
async function importPlugin(name: string): Promise<(options?: unknown) => unknown> {
  const mod = await importBundler(name);
  return (mod.default ?? mod) as (options?: unknown) => unknown;
}

/** Converts `shadow.alias` (prefix → workspace-relative dir) into `@rollup/plugin-alias` regex entries. */
function toRollupAlias(workspace: Workspace, alias: Record<string, string>): { find: RegExp; replacement: string }[] {
  return Object.entries(alias).map(([prefix, dir]) => {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { find: new RegExp(`^${escaped}(.*)`), replacement: `${path.join(workspace.path, dir)}/$1` };
  });
}

/** Resolves each JS export base to its `src/<base>.ts[x]` entrypoint — the Rollup inputs. Asset exports (CSS) are skipped. */
function resolveRollupInputs(workspace: Workspace): string[] {
  const srcDir = path.join(workspace.path, 'src');
  return Object.values(workspace.exports)
    .filter(base => !isAssetBase(base))
    .map(base => {
      const found = [`${base}.tsx`, `${base}.ts`].map(candidate => path.join(srcDir, candidate)).find(fs.existsSync);
      if (!found) throw new ShadowError(`Component build: no source for export base "${base}" (looked for src/${base}.ts and .tsx)`);
      return found;
    });
}

/** Returns the `'use client'` banner for a chunk whose source module matches one of the `useClient` globs, else empty. */
function useClientBanner(workspace: Workspace, facadeModuleId: string | null | undefined, globs: string[]): string {
  if (!facadeModuleId) return '';
  const relative = path.relative(workspace.path, facadeModuleId);
  return globs.some(glob => new Bun.Glob(glob).match(relative)) ? "'use client';\n" : '';
}

/**
 * Runs the Rollup pipeline: esbuild transpile (TSX, automatic JSX) + PostCSS (auto CSS Modules with scoped
 * names, single extracted stylesheet, minify) + a per-chunk `'use client'` banner, emitting a
 * `preserveModules` ES tree (`dist/<module>.js`) plus `dist/<extract>`. Deps stay external; `shadow.alias`
 * maps the workspace's import prefix.
 */
async function runRollupBuild(workspace: Workspace, distDir: string, css: ResolvedCss): Promise<void> {
  const { rollup } = (await importBundler('rollup')) as { rollup: (options: unknown) => Promise<{ write: (o: unknown) => Promise<unknown>; close: () => Promise<void> }> };
  const [alias, nodeResolve, esbuild, postcss, banner2, postcssImport] = await Promise.all([
    importPlugin('@rollup/plugin-alias'),
    importPlugin('@rollup/plugin-node-resolve'),
    importPlugin('rollup-plugin-esbuild'),
    importPlugin('rollup-plugin-postcss'),
    importPlugin('rollup-plugin-banner2'),
    importPlugin('postcss-import'),
  ]);

  const aliasPrefixes = Object.keys(workspace.shadow.alias ?? {});
  const aliasEntries = toRollupAlias(workspace, workspace.shadow.alias ?? {});
  const plugins = [
    aliasEntries.length > 0 ? alias({ entries: aliasEntries }) : undefined,
    nodeResolve({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
    esbuild({ target: 'es2022', jsx: 'automatic', tsconfig: path.join(workspace.path, 'tsconfig.build.json') }),
    postcss({ plugins: [postcssImport()], autoModules: true, modules: { generateScopedName: css.scopedName }, extract: css.extract, minimize: css.minify, sourceMap: true }),
    banner2((chunk: { facadeModuleId?: string | null }) => useClientBanner(workspace, chunk.facadeModuleId, css.useClient)),
  ].filter(Boolean);

  const bundle = await rollup({
    input: resolveRollupInputs(workspace),
    external: (id: string) => !id.startsWith('.') && !id.startsWith('/') && !aliasPrefixes.some(prefix => id.startsWith(prefix)),
    plugins,
  });
  await bundle.write({ format: 'es', dir: distDir, preserveModules: true, preserveModulesRoot: 'src', entryFileNames: '[name].js', sourcemap: true });
  await bundle.close();
}

/** Emits declaration files only (`tsc --emitDeclarationOnly` + `tsc-alias`) — Rollup owns the JS, `tsc` owns the types. */
function compileTypesOnly(workspace: Workspace, distDir: string): void {
  const tsc = run('bunx', ['tsc', '--declaration', '--emitDeclarationOnly', '--outDir', distDir, '--project', 'tsconfig.build.json'], { cwd: workspace.path, stream: false });
  if (tsc.status !== 0) throw new ShadowError(`Build failed: tsc exited with code ${tsc.status}\n${`${tsc.stdout}${tsc.stderr}`.trim()}`);

  const alias = run('bunx', ['tsc-alias', '--outDir', distDir, '--project', 'tsconfig.build.json'], { cwd: workspace.path, stream: false });
  if (alias.status !== 0) throw new ShadowError(`Build failed: tsc-alias exited with code ${alias.status}\n${`${alias.stdout}${alias.stderr}`.trim()}`);
}

/**
 * Strips side-effect `import './x.css'` lines from emitted `.d.ts` files — they point at source-only paths
 * that don't exist in `dist` (CSS ships separately as the extracted stylesheet) and break consumers with
 * `skipLibCheck: false`.
 */
function stripCssImportsFromDts(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) stripCssImportsFromDts(full);
    else if (entry.name.endsWith('.d.ts')) {
      const content = fs.readFileSync(full, 'utf-8');
      const stripped = content.replace(/^\s*import\s+['"][^'"]+\.css['"];?[^\n]*\n?/gm, '');
      if (stripped !== content) fs.writeFileSync(full, stripped);
    }
  }
}

/** Emits a `@layer`-wrapped variant of the extracted stylesheet so consumers can de-prioritize the library's styles. */
function emitLayerVariant(distDir: string, css: ResolvedCss): void {
  const source = path.join(distDir, css.extract);
  if (!css.layer || !fs.existsSync(source)) return;
  const layerFile = css.extract.replace(/\.css$/, '.layer.css');
  fs.writeFileSync(path.join(distDir, layerFile), `@layer ${css.layer} {\n${fs.readFileSync(source, 'utf-8')}\n}\n`);
}

/**
 * The React component-library build: a Rollup + PostCSS pipeline (CSS Modules → scoped names + one extracted
 * stylesheet, `'use client'` banners) for the JS/CSS, plus `tsc --emitDeclarationOnly` for the types, then
 * CSS-import stripping and an optional `@layer` variant. Synthesizes `dist/package.json` like a library.
 */
async function buildComponent(workspace: Workspace): Promise<void> {
  const css = resolveCss(workspace.shadow.css);
  const distDir = resetDistDir(workspace);

  await runRollupBuild(workspace, distDir, css);
  compileTypesOnly(workspace, distDir);
  stripCssImportsFromDts(distDir);
  emitLayerVariant(distDir, css);

  writeDistPackage(workspace, distDir);
}

/**
 * The web-app build (SPA or SSR): orchestrates the workspace's own Vite build — Vite, plus any framework
 * plugin such as TanStack Start for SSR, owns CSS, code-splitting, hashing, tree-shaking, and the SSR
 * server/client output. A `shadow.command` overrides the default `vite build`. No `dist/package.json`
 * synthesis: this is an app, not a package.
 */
function buildWeb(workspace: Workspace): void {
  runBuildCommand(workspace, workspace.shadow.command ?? 'vite build');
}

/**
 * Builds one workspace, dispatching on its inferred type: `library` → tsc/tsc-alias package build,
 * `component` → Rollup + PostCSS, `backend` → single-file Bun.build bundle, `spa`/`ssr` → the workspace's
 * Vite build. A `none`-type workspace (the e2e suite) has nothing to build.
 */
export async function buildWorkspace(workspace: Workspace): Promise<void> {
  if (workspace.type === 'none') {
    log.info(`skip   ${workspace.dir} (nothing to build)`);
    return;
  }

  const startTime = process.hrtime();

  if (workspace.type === 'library') buildLibrary(workspace);
  else if (workspace.type === 'component') await buildComponent(workspace);
  else if (workspace.type === 'backend') await buildBackend(workspace);
  else buildWeb(workspace);

  const [seconds, nanoseconds] = process.hrtime(startTime);
  log.success(`Built ${workspace.name} (${workspace.type}) successfully in ${formatDuration(seconds * 1e3 + nanoseconds * 1e-6)}`);
}

/**
 * Builds every buildable workspace, one dependency level at a time. Each workspace in a level runs as its
 * own `build.ts` child process so the level is genuinely parallel (the compile steps are synchronous
 * spawns) and one workspace's bundler can never corrupt another's module state; their output is buffered
 * and replayed in a stable order rather than interleaved.
 */
async function buildMany(workspaces: Workspace[]): Promise<number> {
  const buildable = workspaces.filter(workspace => workspace.type !== ('none' as WorkspaceType));
  if (buildable.length === 0) {
    log.info('nothing to build');
    return 0;
  }
  const levels = topologicalLevels(buildable);

  for (const [index, level] of levels.entries()) {
    log.info(`\nbuilding level ${index + 1}/${levels.length}: ${level.map(workspace => workspace.dir).join(', ')}`);
    const results = await Promise.all(level.map(workspace => runAsync(process.execPath, ['scripts/build.ts', workspace.dir], { cwd: REPO_ROOT })));

    let failed = false;
    for (const [position, result] of results.entries()) {
      const workspace = level[position] as Workspace;
      const output = `${result.stdout}${result.stderr}`.trim();
      if (output) log.info(output);
      if (result.status !== 0) {
        log.error(`failed build — ${workspace.dir} exited with code ${result.status}`);
        failed = true;
      }
    }
    if (failed) return 1;
  }

  log.success(`\n${buildable.length} workspace(s) built successfully`);
  return 0;
}

/** Parses argv, builds one workspace, its dependency closure, or the whole repo, and returns the process exit code. */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  if (args.includes('--all')) return buildMany(findWorkspaces());

  const target = args.find(arg => !arg.startsWith('-'));
  if (!target) throw new ShadowError(`A workspace or --all is required.\n\n${USAGE}`);

  if (target.includes('*')) {
    const glob = new Bun.Glob(target);
    const matched = findWorkspaces().filter(workspace => glob.match(workspace.dir));
    if (matched.length === 0) throw new ShadowError(`No workspace matches "${target}".`);
    return buildMany(matched);
  }

  const workspace = findWorkspace(target);
  if (args.includes('--deps')) return buildMany(transitiveDependencies(workspace));

  await buildWorkspace(workspace);
  return 0;
}

process.exitCode = await main().catch(reportError);
