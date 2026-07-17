/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { type PackageJson, ShadowScriptsError, formatDuration, log, readPackageJson, run } from '@lib/utils';

/**
 * Defining types
 */
export interface BuildLibOptions {
  /** Root directory of the consuming library repo (the one containing package.json, tsconfig.build.json, src/). */
  cwd: string;
}

/**
 * Declaring the constants
 */
const SUPPORTING_FILES = ['README.md', 'LICENSE'];

/**
 * Prepends a `node` shebang if `source` doesn't already start with one. Applied to compiled bin files
 * rather than relying on the source `.ts` file's own shebang surviving `tsc` across TypeScript
 * versions/module settings.
 */
export function ensureShebang(source: string): string {
  return source.startsWith('#!') ? source : `#!/usr/bin/env node\n${source}`;
}

/**
 * A subpath's dist-relative import/require conditions, given its source-relative base (no extension,
 * e.g. `errors/index` for the source file `src/errors/index.ts`).
 */
function buildExportConditions(base: string) {
  return {
    import: { types: `./esm/${base}.d.ts`, default: `./esm/${base}.js` },
    require: { types: `./cjs/${base}.d.ts`, default: `./cjs/${base}.js` },
  };
}

/**
 * Reads the explicit `shadowLibrary.exports` map a consuming package declares — `{ subpath: sourceBase }`,
 * e.g. `{ ".": "index", "./errors": "errors/index" }`. Defaults to a single root export so a package
 * that hasn't opted into subpath exports still builds. Deliberately explicit config rather than a
 * heuristic (e.g. scanning `src/` for barrels) — which subpaths are public API is a decision only the
 * package author can make safely.
 */
export function resolveExportsConfig(packageJson: PackageJson): Record<string, string> {
  const exportsConfig = packageJson.shadowLibrary?.exports ?? { '.': 'index' };
  if (!exportsConfig['.']) throw new ShadowScriptsError('package.json "shadowLibrary.exports" must include a "." entry');
  return exportsConfig;
}

/**
 * Normalizes a package.json `bin` field (string shorthand or name→path map) to a map, keyed by binary
 * name, of source-relative bases — the same shape `shadowLibrary.exports` values use.
 */
function resolveBinConfig(packageJson: PackageJson): Record<string, string> | undefined {
  if (!packageJson.bin) return undefined;
  if (typeof packageJson.bin === 'string') {
    if (!packageJson.name) throw new ShadowScriptsError('package.json has a string "bin" but no "name" to derive the binary name from');
    return { [packageJson.name.replace(/^@[^/]+\//, '')]: packageJson.bin };
  }
  return packageJson.bin;
}

/**
 * Pure transformation: given the source package.json, computes the package.json to write into `dist/`.
 * Contains every generic transform build-lib is responsible for — main/module/types/exports synthesis,
 * `sideEffects` and `bin` path rewriting, `typesVersions` for subpath type resolution — with no filesystem
 * or process access, so it is fully unit-testable.
 */
export function computeDistPackageJson(packageJson: PackageJson): PackageJson {
  const exportsConfig = resolveExportsConfig(packageJson);
  const rootBase = exportsConfig['.'] as string;
  const subpaths = Object.keys(exportsConfig).filter(subpath => subpath !== '.');

  const distPackageJson: PackageJson = structuredClone(packageJson);
  distPackageJson.main = `./cjs/${rootBase}.js`;
  distPackageJson.module = `./esm/${rootBase}.js`;
  distPackageJson.types = `./esm/${rootBase}.d.ts`;
  distPackageJson.exports = {
    ...Object.fromEntries(Object.entries(exportsConfig).map(([subpath, base]) => [subpath, buildExportConditions(base)])),
    './package.json': './package.json',
  };

  if (subpaths.length > 0) {
    const typesVersions: Record<string, string[]> = {};
    for (const subpath of subpaths) typesVersions[subpath.replace(/^\.\//, '')] = [`./esm/${exportsConfig[subpath]}.d.ts`];
    distPackageJson.typesVersions = { '*': typesVersions };
  }

  // `src/foo.ts` sideEffects entries are source paths and must be rewritten into both output trees;
  // glob patterns (e.g. `**/index.js`) already apply to both and pass through unchanged.
  if (Array.isArray(distPackageJson.sideEffects)) {
    distPackageJson.sideEffects = distPackageJson.sideEffects.flatMap(entry => {
      if (!entry.startsWith('src/')) return [entry];
      const relativePath = entry.replace(/^src\//, '').replace(/\.ts$/, '.js');
      return [`./esm/${relativePath}`, `./cjs/${relativePath}`];
    });
  }

  const binConfig = resolveBinConfig(packageJson);
  if (binConfig) distPackageJson.bin = Object.fromEntries(Object.entries(binConfig).map(([name, base]) => [name, `./esm/${base}.js`]));

  delete distPackageJson.scripts;
  delete distPackageJson.devDependencies;
  delete distPackageJson.shadowLibrary;

  return distPackageJson;
}

/**
 * Runs `tsc` then `tsc-alias` into `outDir`, optionally overriding `--module`. Throws with a stage-specific
 * message on failure so callers don't have to guess whether tsc or the alias rewrite broke.
 */
function compile(rootDir: string, outDir: string, label: string, extraTscArgs: string[] = []): void {
  const tsc = run('bunx', ['tsc', '--outDir', outDir, '--project', 'tsconfig.build.json', ...extraTscArgs], { cwd: rootDir });
  if (tsc.status !== 0) throw new ShadowScriptsError(`${label} build failed: tsc exited with code ${tsc.status}`);

  const alias = run('bunx', ['tsc-alias', '--outDir', outDir, '--project', 'tsconfig.build.json'], { cwd: rootDir });
  if (alias.status !== 0) throw new ShadowScriptsError(`${label} build failed: tsc-alias exited with code ${alias.status}`);
}

/**
 * Centralizes the dual ESM/CJS library build shared by the tsc + tsc-alias based library repos
 * (`app`, `class-schema`, `common`, `fastify`, `modules`). Not a fit for repos with a different build
 * shape — `ui` (Rollup, CSS bundling) or `web` (single ESM tsc build, exports declared directly in the
 * source package.json) — those stay on their own build scripts.
 */
export async function buildLib(options: BuildLibOptions): Promise<void> {
  const rootDir = options.cwd;
  const distDir = path.join(rootDir, 'dist');
  const { data: packageJson } = readPackageJson(rootDir);

  const startTime = process.hrtime();

  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  const distPackageJson = computeDistPackageJson(packageJson);
  fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(distPackageJson, null, 2)}\n`);

  for (const file of SUPPORTING_FILES) {
    const source = path.join(rootDir, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(distDir, file));
  }

  compile(rootDir, path.join(distDir, 'esm'), 'ESM');

  const cjsDir = path.join(distDir, 'cjs');
  compile(rootDir, cjsDir, 'CJS', ['--module', 'CommonJS']);
  fs.writeFileSync(path.join(cjsDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

  if (distPackageJson.bin) {
    for (const [name, binPath] of Object.entries(distPackageJson.bin as Record<string, string>)) {
      const absolutePath = path.join(distDir, binPath);
      if (!fs.existsSync(absolutePath)) throw new ShadowScriptsError(`bin entry "${name}" points to a file that doesn't exist after build: ${binPath}`);
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
