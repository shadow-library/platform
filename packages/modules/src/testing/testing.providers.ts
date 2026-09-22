/**
 * Importing npm packages
 */
import { type FactoryProvider } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { FakeDatabaseService } from './fake-database.service';
import { FakeStorageService } from './fake-storage.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Entries for `ShadowFactory.create(AppModule, { overrides })`, which swaps providers by token wherever
 * they are declared. They are factories rather than value providers so an entry can also sit in a test
 * `@Module`'s `providers`, whose metadata is deep-frozen along with any value it holds. An override for a
 * token the app never declares is simply unused.
 */

export function fakeDatabaseProvider(database: DatabaseService = new FakeDatabaseService()): FactoryProvider<DatabaseService> {
  return { token: DatabaseService, useFactory: () => database };
}

export function fakeStorageProvider(storage: StorageService = new FakeStorageService()): FactoryProvider<StorageService> {
  return { token: StorageService, useFactory: () => storage };
}
