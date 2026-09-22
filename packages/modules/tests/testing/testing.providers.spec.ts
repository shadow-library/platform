/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { Module, ShadowFactory } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DatabaseModule, DatabaseService } from '@shadow-library/modules/database';
import { StorageModule, StorageService } from '@shadow-library/modules/storage';
import { fakeDatabaseProvider, FakeDatabaseService, fakeStorageProvider, FakeStorageService } from '@shadow-library/modules/testing';

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
});
