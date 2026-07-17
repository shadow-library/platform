/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { buildLib } from '@lib/build-lib';
import { run } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('buildLib (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should build a real fixture library to dual ESM/CJS dist output', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-build-lib-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/lib',
        version: '1.0.0',
        type: 'module',
        sideEffects: ['src/index.ts'],
        shadowLibrary: { exports: { '.': 'index', './greet': 'greet' } },
        devDependencies: { typescript: '^5.6.3', 'tsc-alias': '^1.8.10' },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ES2022',
          moduleResolution: 'node',
          target: 'ES2022',
          baseUrl: '.',
          paths: { '@lib/*': ['src/*'] },
          esModuleInterop: true,
        },
      }),
      'tsconfig.build.json': JSON.stringify({
        extends: './tsconfig.json',
        'tsc-alias': { resolveFullPaths: true },
        compilerOptions: { noEmit: false, declaration: true },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "export * from './greet';\n",
      'src/greet.ts': "import { SHOUT } from '@lib/shout';\nexport const greet = (name: string) => (SHOUT ? name.toUpperCase() : name);\n",
      'src/shout.ts': 'export const SHOUT = false;\n',
      'README.md': '# fixture lib\n',
      LICENSE: 'MIT\n',
    });
    // Real repos pin `typescript`/`tsc-alias` as devDependencies, which is what makes `bunx tsc`
    // deterministic — install them here so the fixture isn't at the mercy of whatever bunx resolves
    // when a project has no local node_modules at all.
    const install = run('bun', ['install'], { cwd: fixtureDir, stream: false });
    if (install.status !== 0) throw new Error(`fixture bun install failed: ${install.stderr}`);

    await buildLib({ cwd: fixtureDir });

    const distDir = path.join(fixtureDir, 'dist');
    expect(fs.existsSync(path.join(distDir, 'esm', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'esm', 'greet.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'cjs', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'cjs', 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'LICENSE'))).toBe(true);

    // the `@lib/shout` path alias must have been rewritten to a real relative import by tsc-alias
    const greetJs = fs.readFileSync(path.join(distDir, 'esm', 'greet.js'), 'utf-8');
    expect(greetJs).toContain('./shout.js');
    expect(greetJs).not.toContain('@lib/shout');

    const distPackageJson = JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf-8'));
    expect(distPackageJson.exports['./greet']).toBeDefined();
    expect(distPackageJson.sideEffects).toStrictEqual(['./esm/index.js', './cjs/index.js']);
    expect(distPackageJson.scripts).toBeUndefined();
  });

  it('should fail with a clear error when tsc fails to compile', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-build-lib-fail-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/broken-lib',
        version: '1.0.0',
        type: 'module',
        devDependencies: { typescript: '^5.6.3', 'tsc-alias': '^1.8.10' },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ES2022',
          moduleResolution: 'node',
          target: 'ES2022',
        },
      }),
      'tsconfig.build.json': JSON.stringify({
        extends: './tsconfig.json',
        compilerOptions: { noEmit: false, declaration: true, rootDir: 'src' },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'export const x: number = "not a number";\n',
    });
    const install = run('bun', ['install'], { cwd: fixtureDir, stream: false });
    if (install.status !== 0) throw new Error(`fixture bun install failed: ${install.stderr}`);

    await expect(buildLib({ cwd: fixtureDir })).rejects.toThrow(/ESM build failed/);
  });
});
