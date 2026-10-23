export type PropertyFilter<T = string> = (key: string | T, desc: PropertyDescriptor) => boolean;

const IS_CLASS_REGEX = /^class\s/;

class ObjectUtils {
  /** A plain object has `Object.prototype` or `null` as its prototype. */
  isPlainObject(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) return false;
    return Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null;
  }

  /** Detects a class by its source text starting with `class`, so transpiled constructor functions are not recognised. */
  isClass(Class: any): boolean {
    return typeof Class === 'function' && IS_CLASS_REGEX.test(Class.toString());
  }

  getByPath<T = any>(obj: Record<string, any>, path: string): T | undefined {
    let value = obj;
    for (const key of path.split('.')) {
      if (value === undefined || value === null) return undefined;
      value = value[key];
    }

    return value as T;
  }

  pickKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const newObj: any = {};
    for (const key of keys) newObj[key] = obj[key];
    return newObj;
  }

  omitKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const newObj: any = {};
    const allKeys = Object.keys(obj) as K[];
    for (const key of allKeys) {
      if (!keys.includes(key)) newObj[key] = obj[key];
    }
    return newObj;
  }

  /** Freezes `obj` in place, recursing into nested objects, and returns the same reference. */
  deepFreeze<T extends object>(obj: T): Readonly<T> {
    const keys = Object.getOwnPropertyNames(obj);
    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key];
      if (typeof value === 'object' && value !== null) this.deepFreeze(value);
    }
    return Object.freeze(obj);
  }

  getAllPropertyNames(target: any, filter: PropertyFilter = () => true): string[] {
    const properties = new Set<string>();
    let prototype = target;
    do {
      for (const propertyName of Object.getOwnPropertyNames(prototype)) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName) as PropertyDescriptor;
        const isValid = filter(propertyName, descriptor);
        if (isValid) properties.add(propertyName);
      }
    } while ((prototype = Object.getPrototypeOf(prototype)));
    return Array.from(properties);
  }

  getAllPropertyDescriptors(target: object, filter: PropertyFilter<symbol> = () => true): Record<string | symbol, PropertyDescriptor> {
    const descriptors: Record<string | symbol, PropertyDescriptor> = {};
    let prototype = target;
    do {
      const ownDescriptors = Object.getOwnPropertyDescriptors(prototype);
      for (const propertyName in ownDescriptors) {
        const descriptor = ownDescriptors[propertyName] as PropertyDescriptor;
        const isValid = filter(propertyName, descriptor);
        if (isValid) descriptors[propertyName] = descriptor;
      }
    } while ((prototype = Object.getPrototypeOf(prototype)));
    return descriptors;
  }
}

export const objectUtils = new ObjectUtils();
