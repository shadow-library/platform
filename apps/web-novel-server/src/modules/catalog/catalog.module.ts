import { Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';

import { DatabaseModule } from '@server/modules/datastore';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { NovelAccessService } from './novel-access.service';

/** `AuthModule` as a bare class resolves to the instance `AuthModule.forRoot` configured in the route tree; a second `forRoot` would be rejected */
@Module({
  imports: [DatabaseModule, FastifyModule, AuthModule],
  controllers: [CatalogController],
  providers: [CatalogService, NovelAccessService],
  exports: [CatalogService, NovelAccessService],
})
export class CatalogModule {}
