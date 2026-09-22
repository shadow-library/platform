/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { Config } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('setConfig', () => {
  it('should set a value and restore the previous one', () => {
    const original = Config.get('log.level');
    const restore = setConfig({ 'log.level': 'error' });
    expect(Config.get('log.level')).toBe('error');

    restore();
    expect(Config.get('log.level')).toBe(original);
  });

  it('should drive the environment predicates', () => {
    const restore = setConfig({ 'app.env': 'production' });
    expect(Config.isProd()).toBe(true);

    restore();
    expect(Config.isProd()).toBe(false);
  });

  it('should unset a key given undefined until restored', () => {
    const restore = setConfig({ 'log.dir': undefined });
    expect(Config.get('log.dir')).toBeUndefined();

    restore();
    expect(Config.get('log.dir')).toBe('logs');
  });

  it('should remove a key on restore that was absent before', () => {
    const restoreUnset = setConfig({ 'log.dir': undefined });
    const restoreSet = setConfig({ 'log.dir': 'tmp-logs' });

    restoreSet();
    expect(Config['cache'].has('log.dir')).toBe(false);
    restoreUnset();
  });

  it('should win over a later registration of the same key', () => {
    const restore = setConfig({ 'app.stage': 'dev' });
    expect(Config.register('app.stage', { allowedValues: ['dev', 'staging', 'prod'], defaultValue: 'prod' })).toBe('dev');
    restore();
  });

  it('should restore nested overrides in reverse order', () => {
    const original = Config.get('log.level');
    const restoreOuter = setConfig({ 'log.level': 'warn' });
    const restoreInner = setConfig({ 'log.level': 'silly' });

    restoreInner();
    expect(Config.get('log.level')).toBe('warn');
    restoreOuter();
    expect(Config.get('log.level')).toBe(original);
  });
});
