import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { resolveAuthClientConfig } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { ProjectOwnershipGuard } from './project-ownership.middleware';
import { ProjectController } from './project/project.controller';
import { ProjectService } from './project/project.service';

@Module({
  imports: [ActorModule, DatabaseModule, StorageModule, FastifyModule],
  controllers: [ProjectController, ProjectOwnershipGuard],
  providers: [{ token: AuthClient, useFactory: () => new AuthClient(resolveAuthClientConfig()) }, ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
