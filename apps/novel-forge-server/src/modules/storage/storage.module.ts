/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { IMAGE_STORAGE } from './image-storage.interface';
import { LocalImageStorageProvider } from './local-image-storage.provider';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  providers: [LocalImageStorageProvider, { token: IMAGE_STORAGE, useClass: LocalImageStorageProvider }],
  exports: [IMAGE_STORAGE],
})
export class StorageModule {}
