/**
 * Importing npm packages
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const startTime = process.hrtime();
const rootDir = path.join(import.meta.dirname, '..');
const distDir = path.join(rootDir, 'dist');

const formatTime = (time: number) => (time < 1000 ? `${time.toFixed(0)}ms` : `${(time / 1000).toFixed(3)}s`);
const success = (message: string) => console.log('\x1b[32m%s\x1b[0m', message); // eslint-disable-line no-console
const error = (message: string) => (console.error('\x1b[31m%s\x1b[0m', message), process.exit(1)); // eslint-disable-line no-console

/** cleaning the previous build */
if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
fs.mkdirSync(distDir);

/**
 * Bundling the library entrypoints, leaving framework peers external. `splitting` keeps modules
 * shared between entrypoints (e.g. AuthClient) as one chunk, so class identity holds across the
 * `.`/`./module` subpaths — required for DI tokens to resolve. The source package.json must not
 * declare `sideEffects: false`: Bun 1.3.x tree-shakes an entry barrel's named re-exports away
 * under it, emitting export lists whose bindings were never declared.
 */
const entrypoints = ['index.ts', 'module/index.ts', 'rp/index.ts', 'testing/index.ts'].map(entry => path.join(rootDir, 'src', entry));
const result = await Bun.build({ entrypoints, root: path.join(rootDir, 'src'), target: 'bun', outdir: distDir, splitting: true, external: ['@shadow-library/*'] });
if (!result.success) error(`Build failed: ${result.logs.join('\n')}`);

/** emitting the type declarations alongside the bundles */
const tsc = spawnSync('bunx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: rootDir, stdio: 'inherit' });
if (tsc.status !== 0) error('Type declaration emit failed');

/** rewriting package.json for the published artifact */
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const keys = ['name', 'type', 'version', 'description', 'author', 'license', 'sideEffects', 'peerDependencies', 'peerDependenciesMeta'];
const distPackageJson = Object.fromEntries(keys.filter(key => key in packageJson).map(key => [key, packageJson[key]]));
distPackageJson.exports = Object.fromEntries(
  Object.entries(packageJson.exports as Record<string, string>).map(([subpath, source]) => {
    const target = source.replace(/^\.\/src\//, './').replace(/\.ts$/, '');
    return [subpath, { types: `${target}.d.ts`, default: `${target}.js` }];
  }),
);
await Bun.write(path.join(distDir, 'package.json'), JSON.stringify(distPackageJson, null, 2));
fs.copyFileSync(path.join(rootDir, 'README.md'), path.join(distDir, 'README.md'));

const endTime = process.hrtime(startTime);
const timeTaken = endTime[0] * 1e3 + endTime[1] * 1e-6;
success(`Built successful in ${formatTime(timeTaken)}`);
