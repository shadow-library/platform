/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { Reflector } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const METADATA_KEYS = { ROUTE: 'route', INJECTABLE: Symbol('injectable'), PARAM_TYPES: 'design:paramtypes' };

describe('ReflectorService', () => {
  describe('appendMetadata', () => {
    it('should define metadata when none exists', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Example {}
      const value = { info: 'first' };

      Reflector.appendMetadata(METADATA_KEYS.INJECTABLE, value, Example);

      const result = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, Example);
      expect(result).toStrictEqual([value]);
    });

    it('should append metadata when metadata already exists', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Example {}
      const value1 = { info: 'first' };
      const value2 = { info: 'second' };

      Reflector.defineMetadata(METADATA_KEYS.ROUTE, [value1], Example);
      Reflector.appendMetadata(METADATA_KEYS.ROUTE, value2, Example);

      const result = Reflect.getMetadata(METADATA_KEYS.ROUTE, Example);
      expect(result).toStrictEqual([value1, value2]);
    });

    it('should append metadata to a method (with propertyKey)', () => {
      const value1 = { type: 'method-level' };
      class Example {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        method() {}
      }

      Reflector.appendMetadata(METADATA_KEYS.PARAM_TYPES, value1, Example.prototype, 'method');

      const result = Reflect.getMetadata(METADATA_KEYS.PARAM_TYPES, Example.prototype, 'method');
      expect(result).toStrictEqual([value1]);
    });

    it('should not modify original array reference', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Example {}
      const initial = [{ msg: 'a' }];
      Reflector.defineMetadata(METADATA_KEYS.INJECTABLE, initial, Example);

      Reflector.appendMetadata(METADATA_KEYS.INJECTABLE, { msg: 'b' }, Example);

      const result = Reflector.getMetadata(METADATA_KEYS.INJECTABLE, Example);
      expect(result).toStrictEqual([{ msg: 'a' }, { msg: 'b' }]);
      expect(result).not.toBe(initial);
    });
  });

  describe('prependMetadata', () => {
    it('should define metadata when none exists', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Example {}
      const value = { info: 'first' };

      Reflector.prependMetadata(METADATA_KEYS.INJECTABLE, value, Example);

      const result = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, Example);
      expect(result).toStrictEqual([value]);
    });

    it('should prepend metadata when metadata already exists', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Example {}
      const value1 = { info: 'first' };
      const value2 = { info: 'second' };

      Reflector.defineMetadata(METADATA_KEYS.ROUTE, [value1], Example);
      Reflector.prependMetadata(METADATA_KEYS.ROUTE, value2, Example);

      const result = Reflect.getMetadata(METADATA_KEYS.ROUTE, Example);
      expect(result).toStrictEqual([value2, value1]);
    });

    it('should prepend metadata to a method (with propertyKey)', () => {
      const value1 = { type: 'method-level' };
      class Example {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        method() {}
      }

      Reflector.prependMetadata(METADATA_KEYS.PARAM_TYPES, value1, Example.prototype, 'method');

      const result = Reflect.getMetadata(METADATA_KEYS.PARAM_TYPES, Example.prototype, 'method');
      expect(result).toStrictEqual([value1]);
    });

    it('should not modify original array reference', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Example {}
      const initial = [{ msg: 'a' }];
      Reflector.defineMetadata(METADATA_KEYS.INJECTABLE, initial, Example);

      Reflector.prependMetadata(METADATA_KEYS.INJECTABLE, { msg: 'b' }, Example);

      const result = Reflector.getMetadata(METADATA_KEYS.INJECTABLE, Example);
      expect(result).toStrictEqual([{ msg: 'b' }, { msg: 'a' }]);
      expect(result).not.toBe(initial);
    });

    it('should handle multiple prepends correctly', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Example {}
      const value1 = { order: 1 };
      const value2 = { order: 2 };
      const value3 = { order: 3 };

      Reflector.appendMetadata(METADATA_KEYS.ROUTE, value1, Example);
      Reflector.prependMetadata(METADATA_KEYS.ROUTE, value2, Example);
      Reflector.prependMetadata(METADATA_KEYS.ROUTE, value3, Example);

      const result = Reflect.getMetadata(METADATA_KEYS.ROUTE, Example);
      expect(result).toStrictEqual([value3, value2, value1]);
    });
  });

  describe('updateMetadata', () => {
    it('should set metadata when no previous metadata exists', () => {
      const target = {};
      const value = { path: '/users' };
      Reflector.updateMetadata(METADATA_KEYS.ROUTE, value, target);
      const result = Reflect.getMetadata(METADATA_KEYS.ROUTE, target);
      expect(result).toStrictEqual(value);
    });

    it('should merge with existing metadata when object exists', () => {
      const target = {};
      Reflect.defineMetadata(METADATA_KEYS.ROUTE, { path: '/users' }, target);
      Reflector.updateMetadata(METADATA_KEYS.ROUTE, { method: 'GET' }, target);
      const result = Reflect.getMetadata(METADATA_KEYS.ROUTE, target);
      expect(result).toStrictEqual({ path: '/users', method: 'GET' });
    });

    it('should replace non-object metadata with new value', () => {
      const target = {};
      const updateValue = { method: 'GET' };
      Reflect.defineMetadata(METADATA_KEYS.ROUTE, 'initial', target);
      Reflector.updateMetadata(METADATA_KEYS.ROUTE, updateValue, target);
      const result = Reflect.getMetadata(METADATA_KEYS.ROUTE, target);
      expect(result).toStrictEqual(updateValue);
    });

    it('should update metadata for specific property key', () => {
      class TestClass {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        method() {}
      }
      const value = { roles: ['admin'] };
      Reflector.updateMetadata(METADATA_KEYS.INJECTABLE, value, TestClass.prototype, 'method');
      const result = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, TestClass.prototype, 'method');
      expect(result).toStrictEqual(value);
    });

    it('should handle null metadata case correctly', () => {
      const target = {};
      const updateValue = { method: 'GET' };
      Reflect.defineMetadata(METADATA_KEYS.ROUTE, null, target);
      Reflector.updateMetadata(METADATA_KEYS.ROUTE, updateValue, target);
      const result = Reflect.getMetadata(METADATA_KEYS.ROUTE, target);
      expect(result).toStrictEqual(updateValue);
    });
  });

  describe('cloneMetadata', () => {
    it('should clone metadata from source to target object', () => {
      const source = {};
      const target = {};
      const metadata1 = { path: '/users' };
      const metadata2 = { injectable: true };
      Reflect.defineMetadata(METADATA_KEYS.ROUTE, metadata1, source);
      Reflect.defineMetadata(METADATA_KEYS.INJECTABLE, metadata2, source);
      Reflector.cloneMetadata(target, source);
      const routeResult = Reflect.getMetadata(METADATA_KEYS.ROUTE, target);
      const injectableResult = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, target);
      expect(routeResult).toStrictEqual(metadata1);
      expect(injectableResult).toStrictEqual(metadata2);
    });

    it('should clone metadata for same property key', () => {
      class SourceClass {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        method() {}
      }

      class TargetClass {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        method() {}
      }

      const metadata = { roles: ['admin'] };
      Reflect.defineMetadata(METADATA_KEYS.INJECTABLE, metadata, SourceClass.prototype, 'method');
      Reflector.cloneMetadata(TargetClass.prototype, SourceClass.prototype, 'method');
      const result = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, TargetClass.prototype, 'method');
      expect(result).toStrictEqual(metadata);
    });

    it('should clone metadata from different property key', () => {
      class SourceClass {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        sourceMethod() {}
      }

      class TargetClass {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        targetMethod() {}
      }

      const metadata = { roles: ['admin'] };
      Reflect.defineMetadata(METADATA_KEYS.INJECTABLE, metadata, SourceClass.prototype, 'sourceMethod');
      Reflector.cloneMetadata(TargetClass.prototype, SourceClass.prototype, 'sourceMethod', 'targetMethod');
      const result = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, TargetClass.prototype, 'targetMethod');
      expect(result).toStrictEqual(metadata);
    });

    it('should return the target object', () => {
      const source = {};
      const target = {};
      const result = Reflector.cloneMetadata(target, source);
      expect(result).toStrictEqual(target);
    });

    it('should handle empty metadata keys', () => {
      const source = {};
      const target = {};
      Reflector.cloneMetadata(target, source);
      const keys = Reflect.getMetadataKeys(target);
      expect(keys).toStrictEqual([]);
    });

    it('should clone multiple metadata keys from source to target for specific properties', () => {
      class SourceClass {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        method() {}
      }

      class TargetClass {
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        method() {}
      }

      const routeMetadata = { path: '/api' };
      const injectableMetadata = { singleton: true };
      Reflect.defineMetadata(METADATA_KEYS.ROUTE, routeMetadata, SourceClass.prototype, 'method');
      Reflect.defineMetadata(METADATA_KEYS.INJECTABLE, injectableMetadata, SourceClass.prototype, 'method');
      Reflector.cloneMetadata(TargetClass.prototype, SourceClass.prototype, 'method');
      const routeResult = Reflect.getMetadata(METADATA_KEYS.ROUTE, TargetClass.prototype, 'method');
      const injectableResult = Reflect.getMetadata(METADATA_KEYS.INJECTABLE, TargetClass.prototype, 'method');
      expect(routeResult).toStrictEqual(routeMetadata);
      expect(injectableResult).toStrictEqual(injectableMetadata);
    });
  });
});
