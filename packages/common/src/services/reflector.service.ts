/**
 * Importing npm packages
 */
import { all as merge } from 'deepmerge';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

type MetadataKey = string | symbol;

/**
 * Declaring the constants
 */

class ReflectorService {
  decorate = Reflect.decorate;
  metadata = Reflect.metadata;

  getMetadataKeys = Reflect.getMetadataKeys;
  getOwnMetadataKeys = Reflect.getOwnMetadataKeys;

  hasMetadata = Reflect.hasMetadata;
  hasOwnMetadata = Reflect.hasOwnMetadata;
  getMetadata = Reflect.getMetadata;
  getOwnMetadata = Reflect.getOwnMetadata;
  defineMetadata = Reflect.defineMetadata;

  deleteMetadata = Reflect.deleteMetadata;

  appendMetadata<T extends object = object>(key: MetadataKey, value: T, target: object, propertyKey?: string | symbol): void {
    const oldMetadata = Reflect.getMetadata(key, target, propertyKey as string | symbol);
    const newMetadata = Array.isArray(oldMetadata) ? [...oldMetadata, value] : [value];
    Reflect.defineMetadata(key, newMetadata, target, propertyKey as string | symbol);
  }

  updateMetadata<T extends object = object>(key: MetadataKey, value: T, target: object, propertyKey?: string | symbol): void {
    const oldMetadata = Reflect.getMetadata(key, target, propertyKey as string | symbol);
    const newMetadata = typeof oldMetadata === 'object' && oldMetadata !== null ? merge([oldMetadata, value]) : value;
    Reflect.defineMetadata(key, newMetadata, target, propertyKey as string | symbol);
  }

  cloneMetadata(target: object, source: object, propertyKey?: string | symbol, targetPropertyKey?: string | symbol): object {
    if (!targetPropertyKey && propertyKey) targetPropertyKey = propertyKey;
    const keys = Reflect.getMetadataKeys(source, propertyKey as string | symbol);
    for (const key of keys) {
      const metadata = Reflect.getMetadata(key, source, propertyKey as string | symbol);
      this.updateMetadata(key, metadata, target, targetPropertyKey as string | symbol);
    }
    return target;
  }
}

const globalRef = global as any;
export const Reflector: ReflectorService = globalRef.reflectorService || (globalRef.reflectorService = new ReflectorService());
