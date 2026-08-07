import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { CatalogModule } from '@server/modules/catalog';
import { DatabaseModule } from '@server/modules/datastore';

import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

@Module({
  imports: [DatabaseModule, FastifyModule, CatalogModule],
  controllers: [WikiController],
  providers: [WikiService],
})
export class WikiModule {}
