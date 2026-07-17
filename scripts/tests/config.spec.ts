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
    expect(config.build.exports).toStrictEqual({ '.': 'index' });
    expect(config.build.outDir).toBe('dist');
    expect(config.verify.files).toBe('{src,tests,scripts}/**/*.ts');
    expect(config.verify.commit).toStrictEqual({ extends: ['@commitlint/config-conventional'], rules: {} });
    expect(config.release).toStrictEqual({ npm: true, publishDir: 'dist', changelog: true });
    expect(config.checkMigrations.dir).toBe('generated/drizzle');
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

  it('should reject an exports map without a "." entry', () => {
    fixtureDir = createFixtureDir('shadow-config-no-root-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': JSON.stringify({ build: { exports: { './errors': 'errors/index' } } }) });
    expect(() => loadConfig(fixtureDir!)).toThrow(/must include a "\."/);
  });

  it('should throw on malformed JSON', () => {
    fixtureDir = createFixtureDir('shadow-config-bad-json-');
    writeFixtureFiles(fixtureDir, { '.shadowrc.json': '{ not valid' });
    expect(() => loadConfig(fixtureDir!)).toThrow(ShadowError);
  });
});
