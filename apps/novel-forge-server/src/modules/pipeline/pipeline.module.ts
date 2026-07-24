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
import { ExtractionModule } from '../extraction/extraction.module';
import { JobsModule } from '../jobs/jobs.module';
import { PlanningModule } from '../planning/planning.module';
import { PublishingController } from '../publishing/publishing.controller';
import { PublishingModule } from '../publishing/publishing.module';
import { RebrandController } from '../rebrand/rebrand.controller';
import { RebrandModule } from '../rebrand/rebrand.module';
import { ReforgeController } from '../reforge/reforge.controller';
import { ReforgeModule } from '../reforge/reforge.module';
import { SourceModule } from '../source/source.module';
import { PipelineController } from './pipeline.controller';

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
 * SourceModule (for AcquireService in JobExecutor) and RebrandModule (for
 * RebrandService in the rebrand job) — so their controllers live here.
 */
@Module({
  imports: [SourceModule, ExtractionModule, PlanningModule, JobsModule, RebrandModule, ReforgeModule, PublishingModule],
  controllers: [PipelineController, RebrandController, ReforgeController, PublishingController],
})
export class PipelineModule {}
