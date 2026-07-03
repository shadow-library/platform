/**
 * Importing npm packages
 */
import fs from 'fs';
import path from 'path';

/**
 * Importing user defined packages
 */
import { utils } from '@shadow-library/common';

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

/** modifying package.json and saving to 'dist' */
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJsonString = fs.readFileSync(packageJsonPath, 'utf-8');
const packageJson = JSON.parse(packageJsonString);
const gitCommit = await Bun.$`git rev-parse HEAD`.text().catch(() => 'unknown');
const distPackageJson: Record<string, unknown> = utils.object.pickKeys(packageJson, ['name', 'type', 'version', 'description', 'author', 'license']);
distPackageJson.main = 'main.js';
distPackageJson.gitCommit = gitCommit.trim();

const distPackageJsonString = JSON.stringify(distPackageJson, null, 2);
await Bun.write(`${distDir}/package.json`, distPackageJsonString);

/** Copy supporting files into 'dist' */
fs.copyFileSync(`${rootDir}/README.md`, `${distDir}/README.md`);
fs.copyFileSync(`${rootDir}/LICENSE`, `${distDir}/LICENSE`);

const entryPoint = path.join(rootDir, 'src', 'main.ts');
const result = await Bun.build({ entrypoints: [entryPoint], target: 'bun', minify: { identifiers: false }, outdir: 'dist' });
if (!result.success) error(`Build failed: ${result.logs.join('\n')}`);

const endTime = process.hrtime(startTime);
const timeTaken = endTime[0] * 1e3 + endTime[1] * 1e-6;
success(`Built successful in ${formatTime(timeTaken)}`);
