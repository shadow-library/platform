/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { CatalogModule } from '@server/modules/catalog';
import { DatabaseModule } from '@server/modules/datastore';

import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, CatalogModule, FastifyModule],
  controllers: [ReaderController],
  providers: [ReaderService],
  exports: [ReaderService],
})
export class ReaderModule {}
