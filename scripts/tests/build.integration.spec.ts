/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { build } from '@lib/build';
import { run } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const TSCONFIG = JSON.stringify({
  compilerOptions: { module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022', paths: { '@lib/*': ['./src/*'] }, esModuleInterop: true },
});
const TSCONFIG_BUILD = JSON.stringify({
  extends: './tsconfig.json',
  'tsc-alias': { resolveFullPaths: true },
  compilerOptions: { noEmit: false, declaration: true, rootDir: 'src' },
  include: ['src/**/*.ts'],
});

/** Real repos pin typescript/tsc-alias, which is what makes `bunx tsc` deterministic — install them so the fixture matches. */
function installFixture(dir: string): void {
  const install = run('bun', ['install'], { cwd: dir, stream: false });
  if (install.status !== 0) throw new Error(`fixture bun install failed: ${install.stderr}`);
}

describe('build (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should build a fixture to a flat ESM-only dist with subpath exports', async () => {
    fixtureDir = createFixtureDir('shadow-build-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/lib',
        version: '1.0.0',
        type: 'module',
        sideEffects: ['src/index.ts'],
        devDependencies: { typescript: '^6.0.3', 'tsc-alias': '^1.9.1' },
      }),
      '.shadowrc.json': JSON.stringify({ build: { exports: { '.': 'index', './greet': 'greet' } } }),
      'tsconfig.json': TSCONFIG,
      'tsconfig.build.json': TSCONFIG_BUILD,
      'src/index.ts': "export * from './greet';\n",
      'src/greet.ts': "import { SHOUT } from '@lib/shout';\nexport const greet = (name: string) => (SHOUT ? name.toUpperCase() : name);\n",
      'src/shout.ts': 'export const SHOUT = false;\n',
      'README.md': '# fixture lib\n',
      LICENSE: 'MIT\n',
    });
    installFixture(fixtureDir);

    await build({ cwd: fixtureDir });

    const distDir = path.join(fixtureDir, 'dist');
    // flat layout — no esm/ or cjs/ subdirectories
    expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'greet.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'esm'))).toBe(false);
    expect(fs.existsSync(path.join(distDir, 'cjs'))).toBe(false);
    expect(fs.existsSync(path.join(distDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'LICENSE'))).toBe(true);

    // the `@lib/shout` path alias must have been rewritten to a real relative import by tsc-alias
    const greetJs = fs.readFileSync(path.join(distDir, 'greet.js'), 'utf-8');
    expect(greetJs).toContain('./shout.js');
    expect(greetJs).not.toContain('@lib/shout');

    const distPackageJson = JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf-8'));
    expect(distPackageJson.type).toBe('module');
    expect(distPackageJson.main).toBe('./index.js');
    expect(distPackageJson.exports['.']).toStrictEqual({ types: './index.d.ts', default: './index.js' });
    expect(distPackageJson.exports['./greet']).toStrictEqual({ types: './greet.d.ts', default: './greet.js' });
    expect(distPackageJson.sideEffects).toStrictEqual(['./index.js']);
    expect(distPackageJson.scripts).toBeUndefined();
  });

  it('should fail with a clear error when tsc fails to compile', async () => {
    fixtureDir = createFixtureDir('shadow-build-fail-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/broken-lib', version: '1.0.0', type: 'module', devDependencies: { typescript: '^6.0.3', 'tsc-alias': '^1.9.1' } }),
      '.shadowrc.json': JSON.stringify({ build: { exports: { '.': 'index' } } }),
      'tsconfig.json': TSCONFIG,
      'tsconfig.build.json': JSON.stringify({ extends: './tsconfig.json', compilerOptions: { noEmit: false, declaration: true, rootDir: 'src' }, include: ['src/**/*.ts'] }),
      'src/index.ts': 'export const x: number = "not a number";\n',
    });
    installFixture(fixtureDir);

    await expect(build({ cwd: fixtureDir })).rejects.toThrow(/Build failed/);
  });
});
