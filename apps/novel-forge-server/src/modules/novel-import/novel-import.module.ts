import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { JobsModule } from '../jobs/jobs.module';
import { NovelImportController } from './novel-import.controller';
import { NovelImportService } from './novel-import.service';

// JobsModule is imported here (for JobExecutor, used to fire-and-forget dispatch) rather than the
// other way around: JobExecutor.runImport needs nothing from this module — it inserts chapters and the
// cover directly via DatabaseService/StorageService, exactly like runRebrand/runReforge/runPublish — so
// there is no cycle to avoid, unlike the Rebrand/Reforge/Publishing split (see PipelineModule).
@Module({
  imports: [ActorModule, DatabaseModule, JobsModule, FastifyModule],
  controllers: [NovelImportController],
  providers: [NovelImportService],
  exports: [NovelImportService],
})
export class NovelImportModule {}
