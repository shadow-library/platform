/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppModule } from '@examples/di-and-lifecycle/app.module';
import { CatInternalService } from '@examples/di-and-lifecycle/cat/cat-internal.service';
import { CatModule } from '@examples/di-and-lifecycle/cat/cat.module';
import { CatService } from '@examples/di-and-lifecycle/cat/cat.service';
import { OutputService } from '@examples/di-and-lifecycle/common/output.service';
import { DogModule } from '@examples/di-and-lifecycle/dog/dog.module';
import { DogService } from '@examples/di-and-lifecycle/dog/dog.service';
import { ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Lifecycle', () => {
  let app: ShadowApplication;
  let output: string[] = [];

  beforeEach(async () => {
    output = [];
    OutputService.prototype['log'] = jest.fn((message: string) => output.push(message));
    app = await ShadowFactory.create(AppModule);
  });

  it('should call the lifecycle hooks in the correct order', async () => {
    await app.init();

    expect(output).toEqual([
      '[INFO] OutputService initialized',
      '[INFO] StorageService initialized',
      '[INFO] StorageService initialized',
      '[INFO] CommonModule initialized',
      '[INFO] CatInternalService initialized',
      '[INFO] CatService initialized',
      '[INFO] CatController initialized',
      '[INFO] CatModule initialized',
      '[INFO] DogService initialized',
      '[INFO] DogController initialized',
      '[INFO] DogModule initialized',
      '[INFO] AppModule initialized',
      '[INFO] OutputService application is ready',
      '[INFO] StorageService application is ready',
      '[INFO] StorageService application is ready',
      '[INFO] CommonModule application is ready',
      '[INFO] CatInternalService application is ready',
      '[INFO] CatService application is ready',
      '[INFO] CatController is ready',
      '[INFO] CatModule application is ready',
      '[INFO] DogService application is ready',
      '[INFO] DogController is ready',
      '[INFO] DogModule application is ready',
      '[INFO] AppModule application is ready',
    ]);
  });

  it('should create a new instance of transient for each service', () => {
    const catService = app.select(CatModule).get(CatService);
    const dogService = app.select(DogModule).get(DogService);
    expect(catService['storageService']).not.toBe(dogService['storageService']);
  });

  it('should create a single instance of singleton', () => {
    const dogService = app.select(DogModule).get(DogService);
    const catService = app.select(CatModule).get(CatService);
    const catInternalService = app.select(CatModule).get(CatInternalService);
    expect(dogService['outputService']).toBe(catService['outputService']);
    expect(dogService['outputService']).toBe(catInternalService['outputService']);
  });

  it('should inject optional dependencies', () => {
    const catInternalService = app.select(CatModule).get(CatInternalService);
    expect(catInternalService['catOptions']).toEqual({ option1: 'value1', option2: 'value2' });
  });

  it('should not inject optional dependency if not found or accessible', () => {
    const dogService = app.select(DogModule).get(DogService);
    expect(dogService['catInternalService']).toBeUndefined();
  });

  it('should handle module destruction', async () => {
    output = [];
    await app.stop();

    expect(output).toEqual([
      '[INFO] AppModule application is stopping',
      '[INFO] DogService application is stopping',
      '[INFO] DogController is stopping',
      '[INFO] DogModule application is stopping',
      '[INFO] CatInternalService application is stopping',
      '[INFO] CatService application is stopping',
      '[INFO] CatController is stopping',
      '[INFO] CatModule application is stopping',
      '[INFO] OutputService application is stopping',
      '[INFO] StorageService application is stopping',
      '[INFO] StorageService application is stopping',
      '[INFO] CommonModule application is stopping',
      '[INFO] AppModule destroyed',
      '[INFO] DogService destroyed',
      '[INFO] DogController destroyed',
      '[INFO] DogModule destroyed',
      '[INFO] CatInternalService destroyed',
      '[INFO] CatService destroyed',
      '[INFO] CatController destroyed',
      '[INFO] CatModule destroyed',
      '[INFO] OutputService destroyed',
      '[INFO] StorageService destroyed',
      '[INFO] StorageService destroyed',
      '[INFO] CommonModule destroyed',
    ]);
  });
});
