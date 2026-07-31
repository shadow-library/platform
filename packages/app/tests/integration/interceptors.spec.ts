/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppModule } from '@examples/interceptors/app.module';
import { CacheService } from '@examples/interceptors/cache.service';
import { CatService } from '@examples/interceptors/cat.service';
import { ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Interceptor', () => {
  let app: ShadowApplication;

  beforeEach(async () => {
    app = await ShadowFactory.create(AppModule);
  });

  it('should cache the result of sync function', () => {
    const cacheService = app.select(AppModule).get(CacheService);
    const catService = app.get(CatService);

    const result = catService.getCats();

    expect(cacheService['cache'].size).toBe(1);
    expect(Array.from(cacheService['cache'].keys())).toEqual(['cats']);
    expect(result).toEqual([
      { id: '1', name: 'Whiskers', age: 3 },
      { id: '2', name: 'Tom', age: 5 },
      { id: '3', name: 'Jerry', age: 2 },
    ]);
  });

  it('should cache the result of async function', async () => {
    const cacheService = app.select(AppModule).get(CacheService);
    const catService = app.get(CatService);

    const result = await catService.getCatByName('Tom');

    expect(cacheService['cache'].size).toBe(1);
    expect(Array.from(cacheService['cache'].keys())).toEqual(['cat_by_name_Tom']);
    expect(result).toEqual({ id: '2', name: 'Tom', age: 5 });
  });

  it('should return the cached result of sync function', () => {
    const cacheService = app.select(AppModule).get(CacheService);
    const catService = app.get(CatService);
    cacheService['cache'].set('cats', [{ id: '1', name: 'Tom', age: 10 }]);

    const result = catService.getCats();

    expect(result).toEqual([{ id: '1', name: 'Tom', age: 10 }]);
    expect(cacheService['cache'].size).toBe(1);
  });

  it('should return the cached result of async function', async () => {
    const cacheService = app.select(AppModule).get(CacheService);
    const catService = app.get(CatService);
    cacheService['cache'].set('cat_by_name_Tom', { id: '1', name: 'Tom', age: 7 });

    const result = await catService.getCatByName('Tom');

    expect(result).toEqual({ id: '1', name: 'Tom', age: 7 });
    expect(cacheService['cache'].size).toBe(1);
  });
});
