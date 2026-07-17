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
 * Pure transformation: given the source package.json and resolved build config, computes the package.json
 * to write into the output directory. Contains every generic transform build is responsible for —
 * main/module/types/exports synthesis, `sideEffects` and `bin` path rewriting, `typesVersions` for
 * subpath type resolution — with no filesystem or process access, so it is fully unit-testable.
 */
export function computeDistPackageJson(packageJson: PackageJson, config: BuildConfig): PackageJson {
  const { exports: exportsConfig } = config;
  const rootBase = exportsConfig['.'] as string;
  const subpaths = Object.keys(exportsConfig).filter(subpath => subpath !== '.');

  const distPackageJson: PackageJson = structuredClone(packageJson);
  distPackageJson.type = 'module';
  distPackageJson.main = `./${rootBase}.js`;
  distPackageJson.module = `./${rootBase}.js`;
  distPackageJson.types = `./${rootBase}.d.ts`;
  distPackageJson.exports = {
    ...Object.fromEntries(Object.entries(exportsConfig).map(([subpath, base]) => [subpath, buildExportConditions(base)])),
    './package.json': './package.json',
  };

  if (subpaths.length > 0) {
    const typesVersions: Record<string, string[]> = {};
    for (const subpath of subpaths) typesVersions[subpath.replace(/^\.\//, '')] = [`./${exportsConfig[subpath]}.d.ts`];
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
function compile(rootDir: string, outDir: string): void {
  const tsc = run('bunx', ['tsc', '--outDir', outDir, '--project', 'tsconfig.build.json'], { cwd: rootDir, stream: false });
  if (tsc.status !== 0) throw new ShadowError(`Build failed: tsc exited with code ${tsc.status}\n${`${tsc.stdout}${tsc.stderr}`.trim()}`);

  const alias = run('bunx', ['tsc-alias', '--outDir', outDir, '--project', 'tsconfig.build.json'], { cwd: rootDir, stream: false });
  if (alias.status !== 0) throw new ShadowError(`Build failed: tsc-alias exited with code ${alias.status}\n${`${alias.stdout}${alias.stderr}`.trim()}`);
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

  const distPackageJson = computeDistPackageJson(packageJson, config);
  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(distPackageJson, null, 2)}\n`);

  for (const file of SUPPORTING_FILES) {
    const source = path.join(rootDir, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(distDir, file));
  }

  compile(rootDir, distDir);

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
