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

  it('should build a backend repo into a single-file tree-shaken Bun bundle with a trimmed manifest', async () => {
    fixtureDir = createFixtureDir('shadow-build-backend-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/svc',
        version: '1.2.3',
        type: 'module',
        description: 'a service',
        author: 'me',
        license: 'MIT',
        dependencies: { left: '1' },
      }),
      '.shadowrc.json': JSON.stringify({ type: 'backend', build: { entries: ['scripts/migrate.ts'], assets: ['generated/migrations'] } }),
      'src/main.ts': "import { greet } from './greet';\nconsole.log(greet('world'));\n",
      'src/greet.ts': 'export const greet = (name: string): string => `hi ${name}`;\nexport const UNUSED = 42;\n',
      'scripts/migrate.ts': "console.log('migrating');\n",
      'generated/migrations/0000_init.sql': '-- init\n',
    });

    await build({ cwd: fixtureDir });

    const distDir = path.join(fixtureDir, 'dist');
    const mainJs = fs.readFileSync(path.join(distDir, 'main.js'), 'utf-8');
    expect(fs.existsSync(path.join(distDir, 'migrate.js'))).toBe(true); // extra entrypoint bundled
    expect(mainJs).not.toContain("from './greet'"); // local module inlined into the single file
    expect(mainJs).toContain('hi '); // greet's body was bundled in
    expect(fs.existsSync(path.join(distDir, 'generated/migrations/0000_init.sql'))).toBe(true); // asset copied

    const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf-8'));
    expect(manifest.main).toBe('main.js');
    expect(manifest.name).toBe('@fixtures/svc');
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.dependencies).toBeUndefined(); // deps are inlined, not declared
  });

  it('should build a component library with CSS Modules, use-client banners, and a @layer variant', async () => {
    fixtureDir = createFixtureDir('shadow-build-component-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/kit', version: '1.0.0', type: 'module', devDependencies: { typescript: '^6.0.3', 'tsc-alias': '^1.9.1' } }),
      '.shadowrc.json': JSON.stringify({
        type: 'component',
        build: { exports: { '.': 'index', './styles.css': 'styles.css' }, alias: { '@/': 'src/' }, css: { layer: 'demo', useClient: ['**/*.tsx', '**/client.ts'] } },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022', strict: true, skipLibCheck: true, declaration: true, paths: { '@/*': ['./src/*'] } },
      }),
      'tsconfig.build.json': JSON.stringify({
        extends: './tsconfig.json',
        'tsc-alias': { resolveFullPaths: true },
        compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true, outDir: 'dist', rootDir: 'src' },
        include: ['src/**/*.ts', 'src/**/*.tsx'],
      }),
      'src/css.d.ts': "declare module '*.module.css' {\n  const classes: Record<string, string>;\n  export default classes;\n}\ndeclare module '*.css';\n",
      'src/index.ts': "import './global.css';\nexport * from '@/widget';\nexport * from '@/client';\n",
      'src/widget.ts': "import styles from '@/widget.module.css';\nexport const boxClass: string = styles.box ?? '';\n",
      'src/client.ts': 'export const CLIENT = true;\n',
      'src/widget.module.css': '.box {\n  color: red;\n  padding: 4px;\n}\n',
      'src/global.css': 'body {\n  margin: 0;\n}\n',
    });
    installFixture(fixtureDir);

    await build({ cwd: fixtureDir });

    const distDir = path.join(fixtureDir, 'dist');
    expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'widget.js'))).toBe(true); // preserveModules keeps per-module files

    // CSS Modules: one extracted, minified stylesheet with the scoped class name
    const styles = fs.readFileSync(path.join(distDir, 'styles.css'), 'utf-8');
    expect(styles).toMatch(/\.sh-box_[\w-]+/);

    // @layer variant wraps the extracted CSS
    const layer = fs.readFileSync(path.join(distDir, 'styles.layer.css'), 'utf-8');
    expect(layer.startsWith('@layer demo {')).toBe(true);

    // 'use client' banner injected for the matched module, not others
    expect(fs.readFileSync(path.join(distDir, 'client.js'), 'utf-8')).toContain("'use client'");
    expect(fs.readFileSync(path.join(distDir, 'widget.js'), 'utf-8')).not.toContain("'use client'");

    // .d.ts emitted by tsc, with the side-effect CSS import stripped
    const indexDts = fs.readFileSync(path.join(distDir, 'index.d.ts'), 'utf-8');
    expect(indexDts).not.toContain('global.css');

    // package.json synthesized with the raw-asset CSS export
    const distPackageJson = JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf-8'));
    expect(distPackageJson.exports['./styles.css']).toBe('./styles.css');
    expect(distPackageJson.exports['.']).toStrictEqual({ types: './index.d.ts', default: './index.js' });
  });

  it('should orchestrate the repo build command for a web (spa/ssr) type without synthesizing package.json', async () => {
    fixtureDir = createFixtureDir('shadow-build-web-');
    const fakeVite = 'const fs=require("fs");fs.mkdirSync("dist",{recursive:true});fs.writeFileSync("dist/index.html","<html></html>");';
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: 'web-app', type: 'module' }),
      '.shadowrc.json': JSON.stringify({ type: 'spa', build: { command: ['node', '-e', fakeVite] } }),
    });

    await build({ cwd: fixtureDir });

    expect(fs.existsSync(path.join(fixtureDir, 'dist/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'dist/package.json'))).toBe(false); // an app, not a package
  });

  it('should honor a --type override over the .shadowrc.json type', async () => {
    fixtureDir = createFixtureDir('shadow-build-override-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/ovr', version: '1.0.0', type: 'module' }),
      '.shadowrc.json': JSON.stringify({ type: 'library', build: { exports: { '.': 'index' } } }),
      'src/main.ts': "console.log('hi');\n",
    });

    // config says library, but --type backend wins → Bun bundle, not a tsc dist
    await build({ cwd: fixtureDir, type: 'backend' });

    expect(fs.existsSync(path.join(fixtureDir, 'dist/main.js'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(fixtureDir, 'dist/package.json'), 'utf-8')).main).toBe('main.js');
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
