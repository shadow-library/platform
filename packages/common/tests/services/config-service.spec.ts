/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { Utils } from '@lib/internal.utils';
import { throwError } from '@lib/shorthands';
import { Config, type ConfigRecords, ConfigService } from '@shadow-library/common';

/**
 * Defining types
 */

interface CustomConfigRecords extends ConfigRecords {
  'custom.key': string;
  'optional.key'?: string;
  'transform.key': string;
  'number.key': number;
  'integer.key': number;
  'boolean.key': boolean;
  'enum.key': 'value1' | 'value2';
  'invalid.key': string;
  'test.sample.one': string;
  'test.sample.two'?: number;
  'test.sample.three': string[];
  'test.sample.four': string[];
  'reloadable.key': string;
}

/**
 * Declaring the constants
 */
mock.module('chokidar', () => {
  return {
    watch: () => ({
      on: () => ({}),
      close: () => ({}),
    }),
  };
});

describe('Config Service', () => {
  process.env.TEST_SAMPLE_ONE = 'test-value-one';
  process.env.TEST_SAMPLE_FOUR = 'value1,value2,value3';

  class CustomConfig extends ConfigService<CustomConfigRecords> {
    constructor() {
      super({ 'app.name': 'test-app' });
      this.load('optional.key');
      this.load('boolean.key', { defaultValue: 'true', validateType: 'boolean' });
      this.load('transform.key', { defaultValue: 'abc', transform: (value: string) => value.toUpperCase() });
      this.load('test.sample.one', { defaultValue: 'default-one' });
      this.load('test.sample.two');
      this.load('test.sample.three', { defaultValue: '', isArray: true });
      this.load('test.sample.four', { isArray: true });
    }
  }

  let config: CustomConfig;

  beforeEach(() => {
    Utils.exit = (err: string | Error) => throwError(err instanceof Error ? err : new Error(err));
    config = new CustomConfig();
    ConfigService.prototype['log'] = () => void 0; /** disable logging for tests */
  });

  describe('load', () => {
    it('should load and validate the configurations correctly', () => {
      expect(config.load('custom.key', { defaultValue: 'random-value' })).toBe(config);
      expect(config.get('custom.key')).toBe('random-value');
    });
  });

  describe('get', () => {
    it('should return the correct value for a given key', () => {
      expect(Config.isDev()).toBe(false);
      expect(Config.isProd()).toBe(false);
      expect(Config.isTest()).toBe(true);
      expect(config.get('boolean.key')).toBe(true);
      expect(config.get('app.name')).toBe('test-app');
      expect(config.get('transform.key')).toBe('ABC');
      expect(config.get('optional.key')).toBeUndefined();
      expect(config.get('test.sample.one')).toBe('test-value-one');
      expect(config.get('test.sample.two')).toBeUndefined();
      expect(config.get('test.sample.three')).toStrictEqual([]);
      expect(config.get('test.sample.four')).toStrictEqual(['value1', 'value2', 'value3']);
    });

    it("should return the 'undefined' if the key is not found", () => {
      expect(config.get('random.key' as any)).toBeUndefined();
    });
  });

  describe('getOrThrow', () => {
    it('should throw an error if the key is not found', () => {
      expect(() => config.getOrThrow('random.key' as any)).toThrow();
    });

    it('should return the value if the key is found', () => {
      expect(config.getOrThrow('app.name')).toBe('test-app');
    });
  });

  describe('invalid initialization', () => {
    beforeAll(() => ((process.env.NODE_ENV = 'production'), void 0));
    afterAll(() => ((process.env.NODE_ENV = 'test'), void 0));

    it("should exit if 'custom.key' is not provided in production", () => {
      class CustomConfigService extends ConfigService<CustomConfigRecords> {
        constructor() {
          super();
          this.load('custom.key', { defaultValue: 'value', isProdRequired: true });
        }
      }
      expect(() => new CustomConfigService()).toThrow();
    });

    it('should exit if the environment variable is invalid number', () => {
      class CustomConfigService extends ConfigService<CustomConfigRecords> {
        constructor() {
          super();
          this.load('number.key', { defaultValue: 'abc', validateType: 'number' });
        }
      }
      expect(() => new CustomConfigService()).toThrow();
    });

    it('should exit if the environment variable is invalid boolean', () => {
      class CustomConfigService extends ConfigService<CustomConfigRecords> {
        constructor() {
          super();
          this.load('boolean.key', { defaultValue: 'abc', validateType: 'boolean' });
        }
      }
      expect(() => new CustomConfigService()).toThrow();
    });

    it('should exit if the environment variable is invalid enum value', () => {
      class CustomConfigService extends ConfigService<CustomConfigRecords> {
        constructor() {
          super();
          this.load('enum.key', { defaultValue: 'value3', allowedValues: ['value1', 'value2'] });
        }
      }
      expect(() => new CustomConfigService()).toThrow();
    });

    it('should exit if the environment variable is invalid', () => {
      class CustomConfigService extends ConfigService<CustomConfigRecords> {
        constructor() {
          super();
          this.load('invalid.key', { defaultValue: 'value', validator: value => value === 'invalid' });
        }
      }
      expect(() => new CustomConfigService()).toThrow();
    });

    it('should exit if the environment variable is an invalid integer', () => {
      class CustomConfigService extends ConfigService<CustomConfigRecords> {
        constructor() {
          super();
          this.load('integer.key', { defaultValue: '3.14', validateType: 'integer' });
        }
      }
      expect(() => new CustomConfigService()).toThrow();
    });

    it('should throw if a config key is loaded twice', () => {
      class CustomConfigService extends ConfigService<CustomConfigRecords> {
        constructor() {
          super();
          this.load('custom.key', { defaultValue: 'value' });
          this.load('custom.key', { defaultValue: 'value2' });
        }
      }
      expect(() => new CustomConfigService()).toThrow();
    });
  });

  describe('validateType: integer', () => {
    it('should load a valid integer config', () => {
      config.load('integer.key', { defaultValue: '42', validateType: 'integer' });
      expect(config.get('integer.key')).toBe(42);
    });
  });

  describe('env file loading', () => {
    const envFilePath = path.resolve('/tmp/test-config-service.env');

    beforeAll(() => {
      fs.writeFileSync(envFilePath, "CUSTOM_KEY=file-value\n# comment line\nTRANSFORM_KEY='quoted-value'\nINVALID_LINE\n=empty-key\n");
    });

    afterAll(() => {
      fs.unlinkSync(envFilePath);
      delete process.env.ENV_FILES;
    });

    it('should load config values from env files', () => {
      process.env.ENV_FILES = envFilePath;
      const envConfig = new ConfigService<CustomConfigRecords>();
      envConfig.load('custom.key');
      expect(envConfig.get('custom.key')).toBe('file-value');
      delete process.env.ENV_FILES;
    });

    it('should strip single quotes from env file values', () => {
      process.env.ENV_FILES = envFilePath;
      const envConfig = new ConfigService<CustomConfigRecords>();
      envConfig.load('transform.key');
      expect(envConfig.get('transform.key')).toBe('quoted-value');
      delete process.env.ENV_FILES;
    });

    it('should give real env variables precedence over file values', () => {
      process.env.ENV_FILES = envFilePath;
      process.env.CUSTOM_KEY = 'env-value';
      const envConfig = new ConfigService<CustomConfigRecords>();
      envConfig.load('custom.key');
      expect(envConfig.get('custom.key')).toBe('env-value');
      delete process.env.CUSTOM_KEY;
      delete process.env.ENV_FILES;
    });

    it('should silently skip non-existent env files', () => {
      process.env.ENV_FILES = '/tmp/non-existent.env';
      expect(() => new ConfigService()).not.toThrow();
      delete process.env.ENV_FILES;
    });
  });

  describe('getRuntime', () => {
    it('should return the current runtime', () => {
      const runtime = config.getRuntime();
      expect(runtime).toBe('bun');
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const callback = mock(() => {});
      const unsubscribe = config.subscribe('test.sample' as any, callback);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should remove the callback when unsubscribe is called', () => {
      const callback = mock(() => {});
      const unsubscribe = config.subscribe('test.sample' as any, callback);
      unsubscribe();
      unsubscribe(); /** calling twice should not throw */
    });
  });

  describe('hot reloading', () => {
    const envFilePath = path.resolve('/tmp/test-hot-reload.env');

    beforeEach(() => {
      process.env.ENV_FILES = envFilePath;
      fs.writeFileSync(envFilePath, 'RELOADABLE_KEY=initial-value\n');
    });

    afterEach(() => {
      fs.unlinkSync(envFilePath);
      delete process.env.ENV_FILES;
    });

    it('should be a no-op if no env files are configured', () => {
      expect(() => config.enableHotReloading()).not.toThrow();
      config.disableHotReloading();
    });

    it('should enable and disable hot reloading', () => {
      const reloadConfig = new ConfigService<CustomConfigRecords>();
      reloadConfig.load('reloadable.key', { defaultValue: 'fallback', reloadable: true });

      reloadConfig.enableHotReloading();
      reloadConfig.enableHotReloading(); /** calling twice should be a no-op */
      reloadConfig.disableHotReloading();
      reloadConfig.disableHotReloading(); /** calling twice should be a no-op */
    });

    it('should load reloadable config from env file', () => {
      const reloadConfig = new ConfigService<CustomConfigRecords>();
      reloadConfig.load('reloadable.key', { defaultValue: 'fallback', reloadable: true });
      expect(reloadConfig.get('reloadable.key')).toBe('initial-value');
    });

    it('should reload config value when env file content changes', () => {
      const reloadConfig = new ConfigService<CustomConfigRecords>();
      reloadConfig.load('reloadable.key', { defaultValue: 'fallback', reloadable: true });
      expect(reloadConfig.get('reloadable.key')).toBe('initial-value');

      fs.writeFileSync(envFilePath, 'RELOADABLE_KEY=updated-value\n');
      reloadConfig['reload']();

      expect(reloadConfig.get('reloadable.key')).toBe('updated-value');
    });

    it('should fall back to default value when a key is removed from the env file', () => {
      const reloadConfig = new ConfigService<CustomConfigRecords>();
      reloadConfig.load('reloadable.key', { defaultValue: 'fallback', reloadable: true });
      expect(reloadConfig.get('reloadable.key')).toBe('initial-value');

      const callback = mock(() => {});
      reloadConfig.subscribe('reloadable' as any, callback);

      fs.writeFileSync(envFilePath, '# key removed\n');
      reloadConfig['reload']();

      expect(reloadConfig.get('reloadable.key')).toBe('fallback');
      expect(callback).toHaveBeenCalledWith('reloadable.key', 'fallback');
    });

    it('should notify subscribers when a reloadable config changes', () => {
      const reloadConfig = new ConfigService<CustomConfigRecords>();
      reloadConfig.load('reloadable.key', { defaultValue: 'fallback', reloadable: true });

      const callback = mock(() => {});
      reloadConfig.subscribe('reloadable' as any, callback);

      fs.writeFileSync(envFilePath, 'RELOADABLE_KEY=subscriber-value\n');
      reloadConfig['reload']();

      expect(callback).toHaveBeenCalledWith('reloadable.key', 'subscriber-value');
    });

    it('should not notify subscribers for non-reloadable config changes', () => {
      const reloadConfig = new ConfigService<CustomConfigRecords>();
      reloadConfig.load('reloadable.key', { defaultValue: 'fallback' });

      const callback = mock(() => {});
      reloadConfig.subscribe('reloadable' as any, callback);

      fs.writeFileSync(envFilePath, 'RELOADABLE_KEY=changed-value\n');
      reloadConfig['reload']();

      expect(reloadConfig.get('reloadable.key')).toBe('initial-value');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify prefix subscribers when a nested config key changes', () => {
      fs.writeFileSync(envFilePath, 'TEST_SAMPLE_TWO=file-initial\n');
      const reloadConfig = new ConfigService<CustomConfigRecords>();
      reloadConfig.load('test.sample.two', { defaultValue: 'default', reloadable: true });

      const exactCallback = mock(() => {});
      const prefixCallback = mock(() => {});
      reloadConfig.subscribe('test.sample.two' as any, exactCallback);
      reloadConfig.subscribe('test.sample' as any, prefixCallback);

      fs.writeFileSync(envFilePath, 'TEST_SAMPLE_TWO=file-updated\n');
      reloadConfig['reload']();

      expect(reloadConfig.get('test.sample.two')).toBe('file-updated');
      expect(exactCallback).toHaveBeenCalledWith('test.sample.two', 'file-updated');
      expect(prefixCallback).toHaveBeenCalledWith('test.sample.two', 'file-updated');
    });
  });
});
