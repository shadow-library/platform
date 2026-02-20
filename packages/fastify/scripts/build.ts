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
const rootDir = path.join(import.meta.dirname, '..');
const distDir = path.join(rootDir, 'dist');

const formatTime = (time: number) => (time < 1000 ? `${time.toFixed(0)}ms` : `${(time / 1000).toFixed(3)}s`);
const success = (message: string) => console.log('\x1b[32m%s\x1b[0m', message); // eslint-disable-line no-console
const error = (message: string) => (console.error('\x1b[31m%s\x1b[0m', message), process.exit(1)); // eslint-disable-line no-console

/** cleaning the previous build */
if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
fs.mkdirSync(distDir);

const startTime = process.hrtime();
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJsonString = fs.readFileSync(packageJsonPath, 'utf-8');
const packageJson = JSON.parse(packageJsonString);

/** modifying package.json and saving to 'dist' */
const distPackageJson = structuredClone(packageJson);
distPackageJson.main = './cjs/index.js';
distPackageJson.module = './esm/index.js';
distPackageJson.types = './esm/index.d.ts';
distPackageJson.exports = { '.': { import: './esm/index.js', require: './cjs/index.js' } };
delete distPackageJson.scripts;
delete distPackageJson.devDependencies;

if (Array.isArray(distPackageJson.sideEffects)) {
  distPackageJson.sideEffects = distPackageJson.sideEffects.flatMap((entry: string) => {
    const relativePath = entry.replace(/^src\//, '').replace(/\.ts$/, '.js');
    return [`./esm/${relativePath}`, `./cjs/${relativePath}`];
  });
}

const distPackageJsonString = JSON.stringify(distPackageJson, null, 2);
fs.writeFileSync(`${distDir}/package.json`, distPackageJsonString);

/** Copy supporting files into 'dist' */
fs.copyFileSync(`${rootDir}/README.md`, `${distDir}/README.md`);
fs.copyFileSync(`${rootDir}/LICENSE`, `${distDir}/LICENSE`);

{
  /** Building ESM */
  const esmDir = path.join(distDir, 'esm');
  const tsc = ['tsc', '--outDir', esmDir, '--project', 'tsconfig.build.json'];
  const tscAlias = ['tsc-alias', '--outDir', esmDir, '--project', 'tsconfig.build.json'];
  let result = spawnSync('bunx', tsc, { cwd: rootDir, stdio: 'inherit' });
  if (result.status === 0) result = spawnSync('bunx', tscAlias, { cwd: rootDir, stdio: 'inherit' });
  if (result.status !== 0) error('ESM Build failed');
}

{
  /** Building CJS */
  const cjsDir = path.join(distDir, 'cjs');
  const tsc = ['tsc', '--outDir', cjsDir, '--module', 'CommonJS', '--project', 'tsconfig.build.json'];
  const tscAlias = ['tsc-alias', '--outDir', cjsDir, '--project', 'tsconfig.build.json'];
  let result = spawnSync('bunx', tsc, { cwd: rootDir, stdio: 'inherit' });
  if (result.status === 0) result = spawnSync('bunx', tscAlias, { cwd: rootDir, stdio: 'inherit' });
  if (result.status !== 0) error('CJS Build failed');
  fs.writeFileSync(`${cjsDir}/package.json`, JSON.stringify({ type: 'commonjs' }));
}

/** Removing temporary files */
const tsbuildinfo = path.join(distDir, 'tsconfig.build.tsbuildinfo');
if (fs.existsSync(tsbuildinfo)) fs.rmSync(tsbuildinfo);

const endTime = process.hrtime(startTime);
const timeTaken = endTime[0] * 1e3 + endTime[1] * 1e-6;
success(`Built successful in ${formatTime(timeTaken)}`);
