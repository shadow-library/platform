import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { resolveAuthClientConfig } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';

import { ProjectAccessService } from './project-access.service';

@Module({
  imports: [FastifyModule],
  providers: [{ token: AuthClient, useFactory: () => new AuthClient(resolveAuthClientConfig()) }, ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
