/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { Injectable, Module, ShadowFactory } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DatabaseModule, DatabaseService } from '@shadow-library/modules/database';
import { StorageModule, StorageService } from '@shadow-library/modules/storage';
import { fakeDatabaseProvider, FakeDatabaseService, fakeStorageProvider, FakeStorageService, withoutStartupHooks } from '@shadow-library/modules/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('testing providers', () => {
  it('should boot a module graph wired to postgres, redis and s3 with no infrastructure', async () => {
    const factory = (): never => {
      throw AppError.internal('the real postgres factory must not run');
    };

    @Module({ imports: [DatabaseModule.forRoot({ postgres: { factory }, redis: true }), StorageModule.forRoot({ driver: 's3' })] })
    class AppModule {}

    const database = new FakeDatabaseService();
    const storage = new FakeStorageService();
    const app = await ShadowFactory.create(AppModule, { enableShutdownHooks: false, overrides: [fakeDatabaseProvider(database), fakeStorageProvider(storage)] });

    expect(app.get(DatabaseService)).toBe(database);
    expect(app.get(StorageService)).toBe(storage);
    await app.stop();
  });

  it('should default to fresh fakes', () => {
    expect(fakeDatabaseProvider().useFactory()).toBeInstanceOf(FakeDatabaseService);
    expect(fakeStorageProvider().useFactory()).toBeInstanceOf(FakeStorageService);
  });

  it('should keep a provider injected but skip its startup hooks', async () => {
    const calls: string[] = [];

    @Injectable()
    class Store {}

    @Injectable()
    class Loader {
      constructor(readonly store: Store) {}

      onModuleInit(): void {
        calls.push('init');
      }

      onApplicationReady(): void {
        calls.push('ready');
      }

      onModuleDestroy(): void {
        calls.push('destroy');
      }
    }

    @Module({ providers: [Store, Loader], exports: [Loader] })
    class AppModule {}

    const app = await ShadowFactory.create(AppModule, { enableShutdownHooks: false, overrides: [withoutStartupHooks(Loader)] });
    const loader = app.get(Loader);

    expect(loader).toBeInstanceOf(Loader);
    expect(loader.store).toBeInstanceOf(Store);
    await app.stop();
    expect(calls).toEqual(['destroy']);
  });
});
