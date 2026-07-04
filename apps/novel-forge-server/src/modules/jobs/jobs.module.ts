/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { CheckpointJanitor } from './checkpoint.janitor';
import { ConcurrencyController } from './concurrency.controller';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';
import { JobsController } from './jobs.controller';
import { AiModule } from '../ai/ai.module';
import { SourceModule } from '../source/source.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, AiModule, SourceModule],
  controllers: [JobsController],
  providers: [JobService, ConcurrencyController, JobExecutor, CheckpointJanitor],
  exports: [JobService, ConcurrencyController, JobExecutor],
})
export class JobsModule {}
