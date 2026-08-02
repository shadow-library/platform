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

import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Access control is not re-implemented here: the wiki read path funnels through `CatalogService.getReadableNovel`,
 * the one door every by-slug read goes through, so a novel a reader may not see answers 404 for its wiki too.
 */

@Module({
  imports: [DatabaseModule, FastifyModule, CatalogModule],
  controllers: [WikiController],
  providers: [WikiService],
})
export class WikiModule {}
