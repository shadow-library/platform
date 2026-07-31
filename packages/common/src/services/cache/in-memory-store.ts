/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AppError } from '../../errors';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class InMemoryStore {
  private readonly store = new Map<string, any>();

  private getOptionalArray<T>(key: string): T[] | undefined {
    const array = this.get<T[]>(key);
    if (Array.isArray(array) || array === undefined) return array;
    throw AppError.internal(`The value at key '${key}' is not an array`);
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.store.get(key) ?? defaultValue;
  }

  set<T>(key: string, value: T): this {
    this.store.set(key, value);
    return this;
  }

  del(key: string): this {
    this.store.delete(key);
    return this;
  }

  insert<T>(key: string, value: T): this {
    const array = this.getOptionalArray<T>(key);
    if (array) array.push(value);
    else this.set(key, [value]);
    return this;
  }

  remove<T>(key: string, value: T): this {
    const array = this.getOptionalArray<T>(key);
    if (array) {
      const updatedArray = array.filter(item => item != value);
      this.set(key, updatedArray);
    }
    return this;
  }

  inc(key: string, value: number): number {
    const current = this.get<number>(key, 0);
    if (typeof current !== 'number') throw AppError.internal(`The value at key '${key}' is not a number`);
    const updated = current + value;
    this.set(key, updated);
    return updated;
  }
}

const globalRef = global as any;
export const GlobalStore: InMemoryStore = globalRef.GlobalStore || (globalRef.GlobalStore = new InMemoryStore());
