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
import { ImageController } from './image.controller';
import { LocalImageStorageProvider } from './local-image-storage.provider';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  controllers: [ImageController],
  providers: [LocalImageStorageProvider, { token: IMAGE_STORAGE, useClass: LocalImageStorageProvider }],
  exports: [IMAGE_STORAGE],
})
export class StorageModule {}
