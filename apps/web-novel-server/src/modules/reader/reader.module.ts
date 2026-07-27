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
import { CatalogModule } from '@server/modules/catalog';
import { DatabaseModule } from '@server/modules/datastore';
import { SessionModule } from '@server/modules/session';

import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, CatalogModule, SessionModule],
  controllers: [ReaderController],
  providers: [ReaderService],
  exports: [ReaderService],
})
export class ReaderModule {}
