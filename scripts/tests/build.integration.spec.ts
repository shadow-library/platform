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

  it('should run a custom build.command bundler and synthesize package.json around its asset output', async () => {
    fixtureDir = createFixtureDir('shadow-build-cmd-');
    // a fake bundler that cleans dist first (like tsup clean:true), then emits JS, a d.ts, and a CSS asset
    const bundler =
      "const fs=require('fs');fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist');" +
      "fs.writeFileSync('dist/index.js','export const x=1;');fs.writeFileSync('dist/index.d.ts','export declare const x: number;');fs.writeFileSync('dist/styles.css','.a{color:red}');";
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/ui', version: '1.0.0', type: 'module', sideEffects: ['**/*.css'] }),
      '.shadowrc.json': JSON.stringify({ build: { command: ['node', '-e', bundler], exports: { '.': 'index', './styles.css': 'styles.css' } } }),
    });

    await build({ cwd: fixtureDir });

    const distDir = path.join(fixtureDir, 'dist');
    expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'styles.css'))).toBe(true);

    // package.json is written AFTER the bundler cleans dist, so the synthesized manifest survives
    const distPackageJson = JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf-8'));
    expect(distPackageJson.exports['.']).toStrictEqual({ types: './index.d.ts', default: './index.js' });
    expect(distPackageJson.exports['./styles.css']).toBe('./styles.css');
    expect(distPackageJson.typesVersions).toBeUndefined();
    expect(distPackageJson.sideEffects).toStrictEqual(['**/*.css']);
  });

  it('should resolve a bare build.command to the local node_modules/.bin', async () => {
    fixtureDir = createFixtureDir('shadow-build-localbin-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/localbin', version: '1.0.0', type: 'module' }),
      '.shadowrc.json': JSON.stringify({ build: { command: 'mybundler', exports: { '.': 'index' } } }),
      'node_modules/.bin/mybundler': '#!/bin/sh\nmkdir -p dist\nprintf "export const x=1;" > dist/index.js\nprintf "export declare const x: number;" > dist/index.d.ts\n',
    });
    fs.chmodSync(path.join(fixtureDir, 'node_modules/.bin/mybundler'), 0o755);

    await build({ cwd: fixtureDir });

    expect(fs.existsSync(path.join(fixtureDir, 'dist/index.js'))).toBe(true);
    const distPackageJson = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'dist/package.json'), 'utf-8'));
    expect(distPackageJson.main).toBe('./index.js');
  });

  it('should fail with a clear error when a custom build.command exits non-zero', async () => {
    fixtureDir = createFixtureDir('shadow-build-cmd-fail-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/ui-fail', version: '1.0.0', type: 'module' }),
      '.shadowrc.json': JSON.stringify({ build: { command: ['node', '-e', 'process.exit(1)'], exports: { '.': 'index' } } }),
    });

    await expect(build({ cwd: fixtureDir })).rejects.toThrow(/Build failed/);
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
