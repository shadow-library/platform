import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { resolveAuthClientConfig } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';

import { ActorService } from './actor.service';
import { AdminAccessService } from './admin-access.service';

@Module({
  imports: [FastifyModule],
  providers: [{ token: AuthClient, useFactory: () => new AuthClient(resolveAuthClientConfig()) }, ActorService, AdminAccessService],
  exports: [ActorService, AdminAccessService],
})
export class ActorModule {}
