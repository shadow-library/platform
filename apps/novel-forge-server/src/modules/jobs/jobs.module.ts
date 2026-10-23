import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { AiModule } from '../ai/ai.module';
import { EventsModule } from '../events/events.module';
import { ProjectAccessModule } from '../project/project-access.module';
import { PublishingModule } from '../publishing/publishing.module';
import { AuthoringClaimModule } from './authoring-claim.module';
import { CheckpointJanitor } from './checkpoint.janitor';
import { JobHandlerRegistryModule } from './job-handler-registry.module';
import { JobExecutor } from './job.executor';
import { JobJanitor } from './job.janitor';
import { JobService } from './job.service';
import { JobsController } from './jobs.controller';
import { PublicationJanitor } from './publication.janitor';

@Module({
  imports: [
    ActorModule,
    DatabaseModule,
    AiModule,
    AuthoringClaimModule,
    EventsModule,
    JobHandlerRegistryModule,
    ProjectAccessModule,
    PublishingModule,
    StorageModule,
    FastifyModule,
  ],
  controllers: [JobsController],
  providers: [JobService, JobExecutor, JobJanitor, CheckpointJanitor, PublicationJanitor],
  exports: [JobService, JobExecutor],
})
export class JobsModule {}
