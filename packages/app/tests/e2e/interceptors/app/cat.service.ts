/**
 * Importing npm packages
 */
import { Injectable, UseInterceptor } from '@shadow-library/app';

import { CacheInterceptor } from './cache.interceptor';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface Cat {
  id: string;
  name: string;
  age: number;
}

/**
 * Declaring the constants
 */

@Injectable()
export class CatService {
  private readonly cats: Cat[] = [];

  constructor() {
    this.cats = [
      { id: '1', name: 'Whiskers', age: 3 },
      { id: '2', name: 'Tom', age: 5 },
      { id: '3', name: 'Jerry', age: 2 },
    ];
  }

  @UseInterceptor(CacheInterceptor, { key: 'cat_by_id', ttl: 1000 })
  getCat(id: string): Cat | undefined {
    return this.cats.find(cat => cat.id === id);
  }

  @UseInterceptor(CacheInterceptor, { key: 'cat_by_name', ttl: 1000 })
  async getCatByName(name: string): Promise<Cat | undefined> {
    await Bun.sleep(10);
    return this.cats.find(cat => cat.name === name);
  }

  @UseInterceptor(CacheInterceptor, { key: 'cats', ttl: 1000 })
  getCats(): Cat[] {
    return this.cats;
  }
}
