/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { loadConfig, PRETTIER_BASE } from '@lib/config';
import { ShadowError } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('config', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should apply defaults when no .shadowrc.json is present', () => {
    fixtureDir = createFixtureDir('shadow-config-defaults-');
    const config = loadConfig(fixtureDir);
    expect(config.type).toBe('library');
    expect(config.build.exports).toStrictEqual({ '.': 'index' });
    expect(config.build.outDir).toBe('dist');
    expect(config.build.command).toBeUndefined();
    expect(config.verify.lintFiles).toBe('{src,tests,scripts}/**/*.{ts,tsx}');
    expect(config.verify.formatFiles).toBe('{src,tests,scripts}/**/*.{ts,tsx}');
    expect(config.verify.test).toBe(true);
    expect(config.verify.lint).toStrictEqual({ rules: {}, ignores: [], overrides: [], globals: undefined, react: undefined, reactVersion: undefined });
    expect(config.verify.commit).toStrictEqual({ extends: ['@commitlint/config-conventional'], rules: {} });
    expect(config.release).toStrictEqual({ npm: true, publishDir: 'dist', changelog: true });
    expect(config.checkMigrations.dir).toBe('generated/drizzle');
  });

  it('should read a custom build.command and asset exports from .shadowrc.json', () => {
    fixtureDir = createFixtureDir('shadow-config-command-');
    writeFixtureFiles(fixtureDir, {
      '.shadowrc.json': JSON.stringify({ build: { command: 'tsup', exports: { '.': 'index', './styles.css': 'styles.css' } } }),
    });
    const config = loadConfig(fixtureDir);
    expect(config.build.command).toBe('tsup');
    expect(config.build.exports).toStrictEqual({ '.': 'index', './styles.css': 'styles.css' });
  });

  it('should split lint and format file sets when verify.files is an object', () => {
    fixtureDir = createFixtureDir('shadow-config-files-');
    writeFixtureFiles(fixtureDir, {
      '.shadowrc.json': JSON.stringify({ verify: { files: { lint: 'src/**/*.tsx', format: '{src,scripts}/**/*.tsx' } } }),
    });
    const config = loadConfig(fixtureDir);
    expect(config.verify.lintFiles).toBe('src/**/*.tsx');
    expect(config.verify.formatFiles).toBe('{src,scripts}/**/*.tsx');
  });

  it('should apply a single verify.files string to both lint and format', () => {
    fixtureDir = createFixtureDir('shadow-config-files-str-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': JSON.stringify({ verify: { files: 'lib/**/*.ts' } }) });
    const config = loadConfig(fixtureDir);
    expect(config.verify.lintFiles).toBe('lib/**/*.ts');
    expect(config.verify.formatFiles).toBe('lib/**/*.ts');
  });

  it('should read verify.lint react/globals/overrides and verify.test', () => {
    fixtureDir = createFixtureDir('shadow-config-lint-');
    writeFixtureFiles(fixtureDir, {
      '.shadowrc.json': JSON.stringify({
        verify: { test: false, lint: { react: true, globals: 'browser', overrides: [{ files: ['**/*.stories.tsx'], rules: { 'no-console': 'off' } }] } },
      }),
    });
    const config = loadConfig(fixtureDir);
    expect(config.verify.test).toBe(false);
    expect(config.verify.lint.react).toBe(true);
    expect(config.verify.lint.globals).toBe('browser');
    expect(config.verify.lint.overrides).toStrictEqual([{ files: ['**/*.stories.tsx'], rules: { 'no-console': 'off' } }]);
  });

  it('should read build config from .shadowrc.json', () => {
    fixtureDir = createFixtureDir('shadow-config-build-');
    writeFixtureFiles(fixtureDir, {
      '.shadowrc.json': JSON.stringify({ build: { exports: { '.': 'index', './hooks': 'hooks/index' }, outDir: 'build' } }),
    });
    const config = loadConfig(fixtureDir);
    expect(config.build.exports).toStrictEqual({ '.': 'index', './hooks': 'hooks/index' });
    expect(config.build.outDir).toBe('build');
  });

  it('should normalize a string bin shorthand using the unscoped package name', () => {
    fixtureDir = createFixtureDir('shadow-config-bin-string-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': JSON.stringify({ build: { bin: 'bin/cli' } }) });
    expect(loadConfig(fixtureDir, '@shadow-library/my-cli').build.bin).toStrictEqual({ 'my-cli': 'bin/cli' });
  });

  it('should keep an object bin map as-is', () => {
    fixtureDir = createFixtureDir('shadow-config-bin-map-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': JSON.stringify({ build: { bin: { foo: 'bin/foo' } } }) });
    expect(loadConfig(fixtureDir).build.bin).toStrictEqual({ foo: 'bin/foo' });
  });

  it('should merge lint rule/ignore and format overrides over the defaults', () => {
    fixtureDir = createFixtureDir('shadow-config-verify-');
    writeFixtureFiles(fixtureDir, {
      '.shadowrc.json': JSON.stringify({
        verify: { lint: { rules: { 'no-console': 'off' }, ignores: ['vendor/**'] }, format: { printWidth: 120 } },
      }),
    });
    const config = loadConfig(fixtureDir);
    expect(config.verify.lint.rules).toStrictEqual({ 'no-console': 'off' });
    expect(config.verify.lint.ignores).toStrictEqual(['vendor/**']);
    expect(config.verify.format).toStrictEqual({ printWidth: 120 });
    // the base ruleset is unchanged by a merge
    expect(PRETTIER_BASE.printWidth).toBe(180);
  });

  it('should merge verify.commit overrides over the base commitlint config', () => {
    fixtureDir = createFixtureDir('shadow-config-commit-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': JSON.stringify({ verify: { commit: { rules: { 'type-enum': [2, 'always', ['feat', 'fix']] } } } }) });
    const config = loadConfig(fixtureDir);
    expect(config.verify.commit.extends).toStrictEqual(['@commitlint/config-conventional']);
    expect(config.verify.commit.rules).toStrictEqual({ 'type-enum': [2, 'always', ['feat', 'fix']] });
  });

  it('should read the repo type and app build fields from .shadowrc.json', () => {
    fixtureDir = createFixtureDir('shadow-config-type-');
    writeFixtureFiles(fixtureDir, {
      '.shadowrc.json': JSON.stringify({
        type: 'backend',
        build: { entry: 'src/server.ts', entries: ['scripts/migrate.ts'], assets: ['generated/drizzle'], minify: false, target: 'node' },
      }),
    });
    const config = loadConfig(fixtureDir);
    expect(config.type).toBe('backend');
    expect(config.build.entry).toBe('src/server.ts');
    expect(config.build.entries).toStrictEqual(['scripts/migrate.ts']);
    expect(config.build.assets).toStrictEqual(['generated/drizzle']);
    expect(config.build.minify).toBe(false);
    expect(config.build.target).toBe('node');
  });

  it('should not eagerly reject an exports map without a "." entry (validated at library build time)', () => {
    fixtureDir = createFixtureDir('shadow-config-no-root-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': JSON.stringify({ build: { exports: { './errors': 'errors/index' } } }) });
    expect(() => loadConfig(fixtureDir!)).not.toThrow();
  });

  it('should throw on malformed JSON', () => {
    fixtureDir = createFixtureDir('shadow-config-bad-json-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': '{ not valid' });
    expect(() => loadConfig(fixtureDir!)).toThrow(ShadowError);
  });
});
