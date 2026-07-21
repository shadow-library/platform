/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AiModule } from '../ai/ai.module';
import { PublishingModule } from '../publishing/publishing.module';
import { RebrandModule } from '../rebrand/rebrand.module';
import { SourceModule } from '../source/source.module';
import { CheckpointJanitor } from './checkpoint.janitor';
import { ConcurrencyController } from './concurrency.controller';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';
import { JobsController } from './jobs.controller';
import { PublicationJanitor } from './publication.janitor';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, AiModule, SourceModule, RebrandModule, PublishingModule, FastifyModule],
  controllers: [JobsController],
  providers: [JobService, ConcurrencyController, JobExecutor, CheckpointJanitor, PublicationJanitor],
  exports: [JobService, ConcurrencyController, JobExecutor],
})
export class JobsModule {}
