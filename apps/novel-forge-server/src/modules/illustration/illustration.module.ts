/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */

import { IllustrationController } from './illustration.controller';
import { IllustrationService } from './illustration.service';
import { StorageModule } from '../storage/storage.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [IllustrationController],
  providers: [IllustrationService],
  exports: [IllustrationService],
})
export class IllustrationModule {}
