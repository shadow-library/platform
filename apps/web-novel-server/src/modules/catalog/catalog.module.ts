import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { fromAuthClient } from '@shadow-library/internal-api';
import { IdentityClient } from '@shadow-library/internal-api/identity';

import { DatabaseModule } from '@server/modules/datastore';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { NovelAccessService } from './novel-access.service';

/** `AuthModule` as a bare class resolves to the instance `AuthModule.forRoot` configured in the route tree; a second `forRoot` would be rejected */
@Module({
  imports: [DatabaseModule, FastifyModule, AuthModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    NovelAccessService,
    { token: IdentityClient, useFactory: (authClient: AuthClient) => new IdentityClient(fromAuthClient(authClient)), inject: [AuthClient] },
  ],
  exports: [CatalogService, NovelAccessService],
})
export class CatalogModule {}
