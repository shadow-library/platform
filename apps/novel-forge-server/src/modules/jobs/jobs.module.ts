import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { AiModule } from '../ai/ai.module';
import { EventsModule } from '../events/events.module';
import { PublishingModule } from '../publishing/publishing.module';
import { RebrandModule } from '../rebrand/rebrand.module';
import { ReforgeModule } from '../reforge/reforge.module';
import { SourceModule } from '../source/source.module';
import { TranslationModule } from '../translation/translation.module';
import { CheckpointJanitor } from './checkpoint.janitor';
import { ConcurrencyController } from './concurrency.controller';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';
import { JobsController } from './jobs.controller';
import { PublicationJanitor } from './publication.janitor';

@Module({
  imports: [ActorModule, DatabaseModule, AiModule, EventsModule, SourceModule, RebrandModule, ReforgeModule, PublishingModule, TranslationModule, StorageModule, FastifyModule],
  controllers: [JobsController],
  providers: [JobService, ConcurrencyController, JobExecutor, CheckpointJanitor, PublicationJanitor],
  exports: [JobService, ConcurrencyController, JobExecutor],
})
export class JobsModule {}
