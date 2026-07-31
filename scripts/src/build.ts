/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { type BuildConfig, type CssBuildConfig, loadConfig, type RepoType, TYPE_DEPENDENCIES } from '@lib/config';
import { formatDuration, log, type PackageJson, readPackageJson, run, ShadowError } from '@lib/utils';

/**
 * Defining types
 */
export interface BuildOptions {
  /** Root directory of the consuming repo (the one containing package.json, tsconfig.build.json, src/). */
  cwd: string;
  /** Overrides the repo type from `.shadowrc.json` (the `--type` CLI flag) — mainly for CI. */
  type?: RepoType;
}

/**
 * Declaring the constants
 */
const SUPPORTING_FILES = ['README.md', 'LICENSE'];

/**
 * Prepends a `bun` shebang if `source` doesn't already start with one. Applied to compiled bin files
 * rather than relying on the source `.ts` file's own shebang surviving `tsc`. A `bun` shebang (not
 * `node`) because every command spawns `bun`/`bunx` and uses Bun APIs — bun is already a hard runtime
 * requirement, so the entry point runs under it too.
 */
export function ensureShebang(source: string): string {
  return source.startsWith('#!') ? source : `#!/usr/bin/env bun\n${source}`;
}

/** A subpath's dist-relative export conditions for the given base (source-relative, no extension, e.g. `errors/index`). ESM only. */
function buildExportConditions(base: string) {
  return { types: `./${base}.d.ts`, default: `./${base}.js` };
}

/**
 * Known static-asset extensions a bundler may emit as raw export targets. Matched against an *allowlist*
 * rather than "has any dot" because a JS-module base can legitimately contain dots — this ecosystem names
 * files `*.service.ts`, `*.controller.ts`, `*.dto.ts`, etc., so `services/config.service` is a module, not an asset.
 */
const ASSET_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less', 'json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'woff', 'woff2', 'ttf', 'otf', 'eot']);

/**
 * True when an export base is a raw asset (ends in a known asset extension, e.g. `styles.css`) rather than a
 * JS module (e.g. `errors/index` or `services/config.service`). Assets are exported as-is with no
 * `types`/`default` conditions or `typesVersions` entry — they are emitted by a custom `build.command` bundler.
 */
function isAssetBase(base: string): boolean {
  const ext = /\.([a-z0-9]+)$/i.exec(base)?.[1]?.toLowerCase();
  return ext !== undefined && ASSET_EXTENSIONS.has(ext);
}

/**
 * Pure transformation: given the source package.json and resolved build config, computes the package.json
 * to write into the output directory. Contains every generic transform build is responsible for —
 * main/module/types/exports synthesis, `sideEffects` and `bin` path rewriting, `typesVersions` for
 * subpath type resolution — with no filesystem or process access, so it is fully unit-testable.
 */
export function computeDistPackageJson(packageJson: PackageJson, config: BuildConfig): PackageJson {
  const { exports: exportsConfig } = config;
  const rootBase = exportsConfig['.'];
  if (!rootBase) throw new ShadowError('build.exports must include a "." entry');
  const subpaths = Object.keys(exportsConfig).filter(subpath => subpath !== '.');
  const typeSubpaths = subpaths.filter(subpath => !isAssetBase(exportsConfig[subpath] as string));

  const distPackageJson: PackageJson = structuredClone(packageJson);
  distPackageJson.type = 'module';
  distPackageJson.main = `./${rootBase}.js`;
  distPackageJson.module = `./${rootBase}.js`;
  distPackageJson.types = `./${rootBase}.d.ts`;
  distPackageJson.exports = {
    ...Object.fromEntries(Object.entries(exportsConfig).map(([subpath, base]) => [subpath, isAssetBase(base) ? `./${base}` : buildExportConditions(base)])),
    './package.json': './package.json',
  };

  if (typeSubpaths.length > 0) {
    const typesVersions: Record<string, string[]> = {};
    for (const subpath of typeSubpaths) typesVersions[subpath.replace(/^\.\//, '')] = [`./${exportsConfig[subpath]}.d.ts`];
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

  // npm strips bin values with a leading `./` on publish, so emit them bare (unlike exports/main, which require `./`).
  if (config.bin) distPackageJson.bin = Object.fromEntries(Object.entries(config.bin).map(([name, base]) => [name, `${base}.js`]));

  delete distPackageJson.scripts;
  delete distPackageJson.devDependencies;

  return distPackageJson;
}

/**
 * Runs `tsc` then `tsc-alias` into `outDir`. Output is captured (not streamed) and surfaced only through the
 * thrown error on failure — so a compile error is still shown to the user, but an *expected* failure (e.g. the
 * build integration test) doesn't spray raw `file(line,col): error` lines into CI logs and annotations.
 */
function compileWithTsc(rootDir: string, outDir: string): void {
  const tsc = run('bunx', ['tsc', '--outDir', outDir, '--project', 'tsconfig.build.json'], { cwd: rootDir, stream: false });
  if (tsc.status !== 0) throw new ShadowError(`Build failed: tsc exited with code ${tsc.status}\n${`${tsc.stdout}${tsc.stderr}`.trim()}`);

  const alias = run('bunx', ['tsc-alias', '--outDir', outDir, '--project', 'tsconfig.build.json'], { cwd: rootDir, stream: false });
  if (alias.status !== 0) throw new ShadowError(`Build failed: tsc-alias exited with code ${alias.status}\n${`${alias.stdout}${alias.stderr}`.trim()}`);
}

/**
 * Resolves a command's leading token to the repo's local `node_modules/.bin/<bin>` when present — so a bare
 * `build.command` like `"tsup"` runs the installed bundler even though {@link run} spawns without a shell (no
 * `.bin` on PATH). A token that isn't a local bin (`bun`, `node`, an absolute path) is left for PATH to resolve.
 */
function resolveBin(rootDir: string, bin: string): string {
  const local = path.join(rootDir, 'node_modules', '.bin', bin);
  return fs.existsSync(local) ? local : bin;
}

/**
 * Runs a repo's own bundler (`build.command`) in place of `tsc` — the escape hatch for component libraries whose
 * build needs CSS Modules, `'use client'` banners, or asset extraction. Output streams live (a bundler prints its
 * own progress and errors), so on failure the error is terse; the command must emit into `outDir`.
 */
function compileWithCommand(rootDir: string, command: string | string[]): void {
  const [bin, ...args] = Array.isArray(command) ? command : command.split(/\s+/).filter(Boolean);
  if (!bin) throw new ShadowError('build.command is empty — set it to a bundler invocation like "tsup" or "vite build"');
  const result = run(resolveBin(rootDir, bin), args, { cwd: rootDir });
  if (result.status !== 0) throw new ShadowError(`Build failed: "${[bin, ...args].join(' ')}" exited with code ${result.status}`);
}

/** Compiles into `outDir` via the configured `build.command` bundler, or the default `tsc` + `tsc-alias` when none is set. */
function compile(rootDir: string, outDir: string, config: BuildConfig): void {
  if (config.command) return compileWithCommand(rootDir, config.command);
  compileWithTsc(rootDir, outDir);
}

/** Copies `assets` (files or directories, repo-relative) into `distDir`, skipping any that don't exist. */
function copyAssets(rootDir: string, distDir: string, assets: string[]): void {
  for (const asset of assets) {
    const source = path.join(rootDir, asset);
    if (!fs.existsSync(source)) continue;
    const dest = path.join(distDir, asset);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(source, dest, { recursive: true });
  }
}

/**
 * The published-library build (tsc + tsc-alias, or a custom `build.command`). Emits a single ESM tree with type
 * declarations and subpath exports, synthesizing `dist/package.json` (`main`/`module`/`types`/`exports`/
 * `typesVersions`, rewritten `sideEffects`, and an optional bin) — routed entirely by `.shadowrc.json`'s `build` block.
 */
async function buildLibrary(rootDir: string, packageJson: PackageJson, config: BuildConfig): Promise<void> {
  const distDir = path.join(rootDir, config.outDir);

  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  // Compile first: a custom `build.command` bundler may clean `outDir` itself, so the synthesized package.json
  // and supporting files are written only after the compile step to survive it.
  compile(rootDir, distDir, config);

  const distPackageJson = computeDistPackageJson(packageJson, config);
  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(distPackageJson, null, 2)}\n`);
  copyAssets(rootDir, distDir, SUPPORTING_FILES);

  if (distPackageJson.bin) {
    for (const [name, binPath] of Object.entries(distPackageJson.bin as Record<string, string>)) {
      const absolutePath = path.join(distDir, binPath);
      if (!fs.existsSync(absolutePath)) throw new ShadowError(`bin entry "${name}" points to a file that doesn't exist after build: ${binPath}`);
      fs.writeFileSync(absolutePath, ensureShebang(fs.readFileSync(absolutePath, 'utf-8')));
      fs.chmodSync(absolutePath, 0o755);
    }
  }

  const tsbuildinfo = path.join(distDir, 'tsconfig.build.tsbuildinfo');
  if (fs.existsSync(tsbuildinfo)) fs.rmSync(tsbuildinfo);
}

/** Runtime metadata carried from source `package.json` into a backend bundle's trimmed `dist/package.json`. */
const BACKEND_MANIFEST_KEYS = ['name', 'type', 'version', 'description', 'author', 'license'] as const;

/** Writes the trimmed `dist/package.json` for a backend bundle: runtime metadata + `main` + the current git commit. */
function writeBackendManifest(rootDir: string, distDir: string, packageJson: PackageJson, entry: string): void {
  const manifest: PackageJson = {};
  for (const key of BACKEND_MANIFEST_KEYS) {
    const value = packageJson[key];
    if (value !== undefined) (manifest as Record<string, unknown>)[key] = value;
  }
  manifest.main = `${path.basename(entry).replace(/\.[cm]?tsx?$/, '')}.js`;

  const gitCommit = run('git', ['rev-parse', 'HEAD'], { cwd: rootDir, stream: false });
  if (gitCommit.status === 0) manifest.gitCommit = gitCommit.stdout.trim();

  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * The backend-service build: a single-file, tree-shaken `Bun.build` bundle runnable with `bun dist/main.js`.
 * Identifier minification stays off so `reflect-metadata`-driven DI keeps working. Bundles any extra `entries`
 * (e.g. a migration runner) alongside `entry`, copies `assets` (e.g. `generated/drizzle`) + README/LICENSE, and
 * writes a trimmed `dist/package.json` — no `dependencies`, since every JS dependency is inlined into the bundle.
 */
async function buildBackend(rootDir: string, packageJson: PackageJson, config: BuildConfig): Promise<void> {
  const distDir = path.join(rootDir, config.outDir);

  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  const entry = config.entry ?? 'src/main.ts';
  // identifiers must stay unminified — reflect-metadata DI resolves classes/params by name.
  const minify = config.minify === false ? false : { whitespace: true, syntax: true, identifiers: false };

  // One Bun.build per entrypoint: a single entry flattens to `dist/<name>.js`, whereas bundling entries that
  // span `src/` and `scripts/` together would mirror their tree into `dist/`. Each output is standalone.
  for (const relative of [entry, ...(config.entries ?? [])]) {
    const entrypoint = path.join(rootDir, relative);
    if (!fs.existsSync(entrypoint)) throw new ShadowError(`Build failed: entrypoint does not exist: ${relative}`);
    const result = await Bun.build({ entrypoints: [entrypoint], target: config.target ?? 'bun', outdir: distDir, minify });
    if (!result.success) throw new ShadowError(`Build failed (${relative}):\n${result.logs.map(String).join('\n')}`);
  }

  writeBackendManifest(rootDir, distDir, packageJson, entry);
  copyAssets(rootDir, distDir, [...SUPPORTING_FILES, ...(config.assets ?? [])]);
}

/** A {@link CssBuildConfig} with every field resolved to its default. */
interface ResolvedCss {
  scopedName: string;
  extract: string;
  minify: boolean;
  useClient: string[];
  layer?: string;
}

/** Applies the component-build CSS defaults (matching the ecosystem UI library) over the user's `build.css`. */
function resolveCss(css: CssBuildConfig = {}): ResolvedCss {
  return {
    scopedName: css.scopedName ?? 'sh-[local]_[hash:base64:5]',
    extract: css.extract ?? 'styles.css',
    minify: css.minify ?? true,
    useClient: css.useClient ?? ['**/*.tsx'],
    layer: css.layer,
  };
}

/** Dynamically imports a bundler package installed by `shadow init --type component`, with a clear error if it's absent. */
async function importBundler(name: string): Promise<Record<string, unknown>> {
  try {
    return (await import(name)) as Record<string, unknown>;
  } catch (cause) {
    const install = TYPE_DEPENDENCIES.component.join(' ');
    throw new ShadowError(`The "component" build needs "${name}" — run \`shadow init --type component\` to install the toolchain (or \`bun add -D ${install}\`).`, { cause });
  }
}

/** Imports a package's default export (the shape Rollup plugins ship), tolerating CJS/ESM interop. */
async function importPlugin(name: string): Promise<(options?: unknown) => unknown> {
  const mod = await importBundler(name);
  return (mod.default ?? mod) as (options?: unknown) => unknown;
}

/** Converts `.shadowrc.json` `build.alias` (prefix → repo-relative dir) into `@rollup/plugin-alias` regex entries. */
function toRollupAlias(rootDir: string, alias: Record<string, string>): { find: RegExp; replacement: string }[] {
  return Object.entries(alias).map(([prefix, dir]) => {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { find: new RegExp(`^${escaped}(.*)`), replacement: `${path.join(rootDir, dir)}/$1` };
  });
}

/** Resolves each JS export base to its `src/<base>.ts[x]` entrypoint — the Rollup inputs. Asset exports (CSS) are skipped. */
function resolveRollupInputs(rootDir: string, config: BuildConfig): string[] {
  const srcDir = path.join(rootDir, 'src');
  return Object.values(config.exports)
    .filter(base => !isAssetBase(base))
    .map(base => {
      const found = [`${base}.tsx`, `${base}.ts`].map(candidate => path.join(srcDir, candidate)).find(fs.existsSync);
      if (!found) throw new ShadowError(`Component build: no source for export base "${base}" (looked for src/${base}.ts and .tsx)`);
      return found;
    });
}

/** Returns the `'use client'` banner for a chunk whose source module matches one of the `useClient` globs, else empty. */
function useClientBanner(rootDir: string, facadeModuleId: string | null | undefined, globs: string[]): string {
  if (!facadeModuleId) return '';
  const relative = path.relative(rootDir, facadeModuleId);
  return globs.some(glob => new Bun.Glob(glob).match(relative)) ? "'use client';\n" : '';
}

/**
 * Runs the Rollup pipeline: esbuild transpile (TSX, automatic JSX) + PostCSS (auto CSS Modules with scoped names,
 * single extracted stylesheet, minify) + a per-chunk `'use client'` banner, emitting a `preserveModules` ES tree
 * (`dist/<module>.js`) plus `dist/<extract>`. Deps stay external; `build.alias` maps the repo's import prefix.
 */
async function runRollupBuild(rootDir: string, distDir: string, config: BuildConfig, css: ResolvedCss): Promise<void> {
  const { rollup } = (await importBundler('rollup')) as { rollup: (options: unknown) => Promise<{ write: (o: unknown) => Promise<unknown>; close: () => Promise<void> }> };
  const [alias, nodeResolve, esbuild, postcss, banner2, postcssImport] = await Promise.all([
    importPlugin('@rollup/plugin-alias'),
    importPlugin('@rollup/plugin-node-resolve'),
    importPlugin('rollup-plugin-esbuild'),
    importPlugin('rollup-plugin-postcss'),
    importPlugin('rollup-plugin-banner2'),
    importPlugin('postcss-import'),
  ]);

  const aliasPrefixes = Object.keys(config.alias ?? {});
  const aliasEntries = toRollupAlias(rootDir, config.alias ?? {});
  const plugins = [
    aliasEntries.length > 0 ? alias({ entries: aliasEntries }) : undefined,
    nodeResolve({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
    esbuild({ target: 'es2022', jsx: 'automatic', tsconfig: path.join(rootDir, 'tsconfig.build.json') }),
    postcss({ plugins: [postcssImport()], autoModules: true, modules: { generateScopedName: css.scopedName }, extract: css.extract, minimize: css.minify, sourceMap: true }),
    banner2((chunk: { facadeModuleId?: string | null }) => useClientBanner(rootDir, chunk.facadeModuleId, css.useClient)),
  ].filter(Boolean);

  const bundle = await rollup({
    input: resolveRollupInputs(rootDir, config),
    external: (id: string) => !id.startsWith('.') && !id.startsWith('/') && !aliasPrefixes.some(prefix => id.startsWith(prefix)),
    plugins,
  });
  await bundle.write({ format: 'es', dir: distDir, preserveModules: true, preserveModulesRoot: 'src', entryFileNames: '[name].js', sourcemap: true });
  await bundle.close();
}

/** Emits declaration files only (`tsc --emitDeclarationOnly` + `tsc-alias`) — Rollup owns the JS, `tsc` owns the types. */
function compileTypesOnly(rootDir: string, distDir: string): void {
  const tsc = run('bunx', ['tsc', '--declaration', '--emitDeclarationOnly', '--outDir', distDir, '--project', 'tsconfig.build.json'], { cwd: rootDir, stream: false });
  if (tsc.status !== 0) throw new ShadowError(`Build failed: tsc exited with code ${tsc.status}\n${`${tsc.stdout}${tsc.stderr}`.trim()}`);

  const alias = run('bunx', ['tsc-alias', '--outDir', distDir, '--project', 'tsconfig.build.json'], { cwd: rootDir, stream: false });
  if (alias.status !== 0) throw new ShadowError(`Build failed: tsc-alias exited with code ${alias.status}\n${`${alias.stdout}${alias.stderr}`.trim()}`);
}

/**
 * Strips side-effect `import './x.css'` lines from emitted `.d.ts` files — they point at source-only paths that
 * don't exist in `dist` (CSS ships separately as the extracted stylesheet) and break consumers with `skipLibCheck: false`.
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
 * stylesheet, `'use client'` banners) for the JS/CSS, plus `tsc --emitDeclarationOnly` for the types, then CSS-import
 * stripping and an optional `@layer` variant. Synthesizes `dist/package.json` (JS + asset exports) like a library.
 */
async function buildComponent(rootDir: string, packageJson: PackageJson, config: BuildConfig): Promise<void> {
  const css = resolveCss(config.css);
  const distDir = path.join(rootDir, config.outDir);

  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  await runRollupBuild(rootDir, distDir, config, css);
  compileTypesOnly(rootDir, distDir);
  stripCssImportsFromDts(distDir);
  emitLayerVariant(distDir, css);

  const distPackageJson = computeDistPackageJson(packageJson, config);
  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(distPackageJson, null, 2)}\n`);
  copyAssets(rootDir, distDir, SUPPORTING_FILES);
}

/**
 * The web-app build (SPA or SSR): orchestrates the repo's own Vite build — Vite, plus any framework plugin such as
 * TanStack Start for SSR, owns CSS, code-splitting, hashing, tree-shaking, and the SSR server/client output. A
 * custom `build.command` overrides the default `vite build`. No `dist/package.json` synthesis: this is an app, not a package.
 */
function buildWeb(rootDir: string, config: BuildConfig, type: RepoType): void {
  const command = config.command ?? 'vite build';
  const [bin, ...args] = Array.isArray(command) ? command : command.split(/\s+/).filter(Boolean);
  if (!bin) throw new ShadowError('build.command is empty');
  const result = run(resolveBin(rootDir, bin), args, { cwd: rootDir });
  if (result.status !== 0) throw new ShadowError(`Build failed (${type}): "${[bin, ...args].join(' ')}" exited with code ${result.status}`);
}

/**
 * Builds the current repo per `.shadowrc.json`, dispatching on its `type` (overridable with `options.type` /
 * the `--type` flag): `library` → tsc/tsc-alias package build, `backend` → single-file Bun.build bundle,
 * `spa`/`ssr` → the repo's Vite build. Server/library builds synthesize `dist/package.json`; app builds don't.
 */
export async function build(options: BuildOptions): Promise<void> {
  const rootDir = options.cwd;
  const { data: packageJson } = readPackageJson(rootDir);
  const config = loadConfig(rootDir, packageJson.name);
  const type = options.type ?? config.type;

  const startTime = process.hrtime();

  if (type === 'library') await buildLibrary(rootDir, packageJson, config.build);
  else if (type === 'component') await buildComponent(rootDir, packageJson, config.build);
  else if (type === 'backend') await buildBackend(rootDir, packageJson, config.build);
  else buildWeb(rootDir, config.build, type);

  const [seconds, nanoseconds] = process.hrtime(startTime);
  const label = packageJson.name ?? path.basename(rootDir);
  log.success(`Built ${label} (${type}) successfully in ${formatDuration(seconds * 1e3 + nanoseconds * 1e-6)}`);
}
