/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { type BuildConfig, loadConfig } from '@lib/config';
import { formatDuration, log, type PackageJson, readPackageJson, run, ShadowError } from '@lib/utils';

/**
 * Defining types
 */
export interface BuildOptions {
  /** Root directory of the consuming repo (the one containing package.json, tsconfig.build.json, src/). */
  cwd: string;
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
  const rootBase = exportsConfig['.'] as string;
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

/**
 * Centralizes the ESM library build (tsc + tsc-alias). Emits a single ESM tree with type declarations and
 * subpath exports, synthesizing `dist/package.json` (`main`/`module`/`types`/`exports`/`typesVersions`,
 * rewritten `sideEffects`, and an optional bin) — routed entirely by `.shadowrc.json`'s `build` block.
 */
export async function build(options: BuildOptions): Promise<void> {
  const rootDir = options.cwd;
  const { data: packageJson } = readPackageJson(rootDir);
  const config = loadConfig(rootDir, packageJson.name).build;
  const distDir = path.join(rootDir, config.outDir);

  const startTime = process.hrtime();

  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  // Compile first: a custom `build.command` bundler may clean `outDir` itself, so the synthesized package.json
  // and supporting files are written only after the compile step to survive it.
  compile(rootDir, distDir, config);

  const distPackageJson = computeDistPackageJson(packageJson, config);
  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(distPackageJson, null, 2)}\n`);

  for (const file of SUPPORTING_FILES) {
    const source = path.join(rootDir, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(distDir, file));
  }

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

  const [seconds, nanoseconds] = process.hrtime(startTime);
  const packageLabel = packageJson.name ?? path.basename(rootDir);
  log.success(`Built ${packageLabel} successfully in ${formatDuration(seconds * 1e3 + nanoseconds * 1e-6)}`);
}
