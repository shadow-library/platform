/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

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
  'boolean.key': boolean;
  'enum.key': 'value1' | 'value2';
  'invalid.key': string;
  'test.sample.one': string;
  'test.sample.two'?: number;
  'test.sample.three': string[];
  'test.sample.four': string[];
}

/**
 * Declaring the constants
 */

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
  });
});
