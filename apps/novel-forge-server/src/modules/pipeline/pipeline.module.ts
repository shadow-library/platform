/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { PipelineController } from './pipeline.controller';
import { ExtractionModule } from '../extraction/extraction.module';
import { JobsModule } from '../jobs/jobs.module';
import { PlanningModule } from '../planning/planning.module';
import { SourceModule } from '../source/source.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * HTTP wiring for the source-pipeline endpoints.
 *
 * Intentionally separate from SourceModule and JobsModule to avoid circular
 * dependencies: SourceModule has no JobsModule dependency; JobsModule imports
 * SourceModule (for AcquireService in JobExecutor).
 */
@Module({
  imports: [SourceModule, ExtractionModule, PlanningModule, JobsModule],
  controllers: [PipelineController],
})
export class PipelineModule {}
