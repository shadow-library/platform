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
import { JobsModule } from '../jobs/jobs.module';
import { NovelImportController } from './novel-import.controller';
import { NovelImportService } from './novel-import.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// JobsModule is imported here (for JobExecutor, used to fire-and-forget dispatch) rather than the
// other way around: JobExecutor.runImport needs nothing from this module — it inserts chapters and the
// cover directly via DatabaseService/IMAGE_STORAGE, exactly like runRebrand/runReforge/runPublish — so
// there is no cycle to avoid, unlike the Rebrand/Reforge/Publishing split (see PipelineModule).
// FastifyModule supplies ContextService (NovelImportService reads the owner principal from it), the
// same import ProjectModule makes for the same reason.
@Module({
  imports: [DatabaseModule, JobsModule, FastifyModule],
  controllers: [NovelImportController],
  providers: [NovelImportService],
  exports: [NovelImportService],
})
export class NovelImportModule {}
