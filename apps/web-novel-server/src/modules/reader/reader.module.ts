import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { CatalogModule } from '@server/modules/catalog';
import { DatabaseModule } from '@server/modules/datastore';

import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';

@Module({
  imports: [DatabaseModule, CatalogModule, FastifyModule],
  controllers: [ReaderController],
  providers: [ReaderService],
  exports: [ReaderService],
})
export class ReaderModule {}
