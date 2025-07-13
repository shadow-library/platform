/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { utils } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Object Utils', () => {
  describe('getByPath', () => {
    const data = {
      name: { first: 'John', last: 'Doe' },
      permissions: { db: { read: true, write: false } },
      sessions: [
        { id: 1, token: 'abc' },
        { id: 2, token: 'xyz' },
      ],
    };

    it('should return the value of the given path', () => {
      expect(utils.object.getByPath(data, 'name.first')).toBe('John');
      expect(utils.object.getByPath(data, 'permissions.db.read')).toBe(true);
    });

    it('should return the value of the given path for array', () => {
      expect(utils.object.getByPath(data, 'sessions.0.token')).toBe('abc');
      expect(utils.object.getByPath(data, 'sessions.1.token')).toBe('xyz');
    });

    it('should return undefined if the path is not found', () => {
      expect(utils.object.getByPath(data, 'name.middle')).toBeUndefined();
      expect(utils.object.getByPath(data, 'address.country')).toBeUndefined();
    });
  });

  describe('pickKeys', () => {
    it('should return a new object with the needed fields', () => {
      const data = { name: 'John Doe', age: 30, email: 'john-doe@email.com' };
      const result = utils.object.pickKeys(data, ['name', 'email']);

      expect(result).not.toBe(data);
      expect(result).toStrictEqual({ name: data.name, email: data.email });
    });
  });

  describe('omitKeys', () => {
    it('should return a new object after removing the unneeded keys', () => {
      const data = { name: 'John Doe', age: 30, email: 'john-doe@email.com' };
      const result = utils.object.omitKeys(data, ['age']);

      expect(result).not.toBe(data);
      expect(result).toStrictEqual({ name: data.name, email: data.email });
    });
  });

  describe('deepFreeze', () => {
    it('should return the object after recursively freezing all the properties', () => {
      const data = { name: 'John Doe', age: 30, address: { city: 'New York', country: 'USA' } };
      const frozenData = utils.object.deepFreeze(data);
      expect(() => ((frozenData as any).name = 'Jane Doe')).toThrow(TypeError);
    });

    it('should return the object after recursively freezing all the properties for nested array', () => {
      const data = { name: 'John Doe', age: 30, address: { city: 'New York', country: 'USA', alias: ['York'] } };
      const frozenData = utils.object.deepFreeze(data);
      expect(() => (frozenData as any).address.alias.push('New')).toThrow(TypeError);
    });
  });

  describe('getAllPropertyNames', () => {
    class Parent {
      parentProp = 'parent';

      parentMethod() {
        return 'parent method';
      }
    }

    class Child extends Parent {
      childProp = 'child';

      childMethod() {
        return 'child method';
      }
    }

    it('should return all property names including inherited ones', () => {
      const instance = new Child();
      const propertyNames = utils.object.getAllPropertyNames(instance);

      expect(propertyNames).toContain('childProp');
      expect(propertyNames).toContain('childMethod');
      expect(propertyNames).toContain('parentProp');
      expect(propertyNames).toContain('parentMethod');
      expect(propertyNames).toContain('constructor');
    });

    it('should filter properties using the provided filter function', () => {
      const instance = new Child();
      const filter = (key: string) => !key.includes('Method') && key !== 'constructor';
      const propertyNames = utils.object.getAllPropertyNames(instance, filter);

      expect(propertyNames).toContain('childProp');
      expect(propertyNames).toContain('parentProp');
      expect(propertyNames).not.toContain('childMethod');
      expect(propertyNames).not.toContain('parentMethod');
      expect(propertyNames).not.toContain('constructor');
    });

    it('should filter by property descriptor attributes', () => {
      const obj = {};
      Object.defineProperty(obj, 'readOnly', { value: 'readonly value', writable: false, enumerable: true, configurable: true });
      Object.defineProperty(obj, 'writable', { value: 'writable value', writable: true, enumerable: true, configurable: true });

      const filter = (_key: string, desc: PropertyDescriptor) => desc.writable === true;
      const propertyNames = utils.object.getAllPropertyNames(obj, filter);

      expect(propertyNames).toContain('writable');
      expect(propertyNames).not.toContain('readOnly');
    });

    it('should return empty array when filter rejects all properties', () => {
      const instance = new Child();
      const filter = () => false;
      const propertyNames = utils.object.getAllPropertyNames(instance, filter);

      expect(propertyNames).toStrictEqual([]);
    });

    it('should handle plain objects', () => {
      const obj = { prop1: 'value1', prop2: 'value2' };
      const propertyNames = utils.object.getAllPropertyNames(obj);

      expect(propertyNames).toContain('prop1');
      expect(propertyNames).toContain('prop2');
    });

    it('should handle objects with symbol properties', () => {
      const symbol = Symbol('test');
      const obj = { normalProp: 'value', [symbol]: 'symbol value' };

      const propertyNames = utils.object.getAllPropertyNames(obj);

      expect(propertyNames).toContain('normalProp');
      expect(propertyNames).not.toContain(symbol);
      expect(propertyNames).not.toContain(symbol.toString());
    });
  });

  describe('getAllPropertyDescriptors', () => {
    class Parent {
      parentProp = 'parent';

      parentMethod() {
        return 'parent method';
      }
    }

    class Child extends Parent {
      childProp = 'child';

      childMethod() {
        return 'child method';
      }
    }

    it('should return all property descriptors including inherited ones', () => {
      const instance = new Child();
      const descriptors = utils.object.getAllPropertyDescriptors(instance);

      expect(descriptors).toHaveProperty('childProp', { value: 'child', writable: true, enumerable: true, configurable: true });
      expect(descriptors).toHaveProperty('childMethod', { value: expect.any(Function), writable: true, enumerable: false, configurable: true });
      expect(descriptors).toHaveProperty('parentProp');
      expect(descriptors).toHaveProperty('parentMethod');
      expect(descriptors).toHaveProperty('constructor');
    });

    it('should filter descriptors using the provided filter function', () => {
      const instance = new Child();
      const filter = (key: string | symbol) => typeof key === 'string' && !key.includes('Method') && key !== 'constructor';
      const descriptors = utils.object.getAllPropertyDescriptors(instance, filter);

      expect(descriptors).toHaveProperty('childProp');
      expect(descriptors).toHaveProperty('parentProp');
      expect(descriptors).toHaveProperty('constructor', Object); // Because 'constructor' is a property of the Object prototype
      expect(descriptors).not.toHaveProperty('childMethod');
      expect(descriptors).not.toHaveProperty('parentMethod');
    });

    it('should filter by property descriptor attributes', () => {
      const obj = {};
      Object.defineProperty(obj, 'readOnly', { value: 'readonly value', writable: false, enumerable: true, configurable: true });
      Object.defineProperty(obj, 'writable', { value: 'writable value', writable: true, enumerable: true, configurable: true });

      const filter = (_key: string | symbol, desc: PropertyDescriptor) => desc.writable === true;
      const descriptors = utils.object.getAllPropertyDescriptors(obj, filter);

      expect(descriptors).toHaveProperty('writable', { value: 'writable value', writable: true, enumerable: true, configurable: true });
      expect(descriptors).not.toHaveProperty('readOnly');
    });

    it('should return empty object when filter rejects all properties', () => {
      const instance = new Child();
      const filter = () => false;
      const descriptors = utils.object.getAllPropertyDescriptors(instance, filter);

      expect(descriptors).toStrictEqual({});
    });

    it('should handle plain objects', () => {
      const obj = { prop1: 'value1', prop2: 'value2' };
      const descriptors = utils.object.getAllPropertyDescriptors(obj);

      expect(descriptors).toHaveProperty('prop1', { value: 'value1', writable: true, enumerable: true, configurable: true });
      expect(descriptors).toHaveProperty('prop2');
    });

    it('should handle objects with getters and setters', () => {
      const obj = {
        _value: 'initial',
        get value() {
          return this._value;
        },
        set value(val: string) {
          this._value = val;
        },
      };

      const descriptors = utils.object.getAllPropertyDescriptors(obj);

      expect(descriptors).toHaveProperty('value');
      expect(descriptors.value).toHaveProperty('get');
      expect(descriptors.value).toHaveProperty('set');
      expect(descriptors.value?.get).toBeInstanceOf(Function);
      expect(descriptors.value?.set).toBeInstanceOf(Function);
    });

    it('should handle inherited descriptors with different attributes', () => {
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Base {
        constructor() {
          Object.defineProperty(this, 'baseReadOnly', { value: 'base readonly', writable: false, enumerable: true, configurable: true });
        }
      }

      class Derived extends Base {
        derivedProp = 'derived';
      }

      const instance = new Derived();
      const descriptors = utils.object.getAllPropertyDescriptors(instance);

      expect(descriptors).toHaveProperty('baseReadOnly', expect.objectContaining({ writable: false }));
      expect(descriptors).toHaveProperty('derivedProp', expect.objectContaining({ writable: true }));
    });
  });
});
