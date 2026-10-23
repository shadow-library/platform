import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { JobsModule } from '../jobs/jobs.module';
import { ImportAdmissionGuard } from './import-admission.middleware';
import { NovelImportController } from './novel-import.controller';
import { NovelImportService } from './novel-import.service';

// JobsModule is imported here (for JobExecutor's fire-and-forget dispatch) rather than the reverse: JobExecutor.runImport needs nothing from this module, so unlike Publishing
// there is no cycle to avoid.
@Module({
  imports: [ActorModule, DatabaseModule, JobsModule, FastifyModule],
  controllers: [NovelImportController, ImportAdmissionGuard],
  providers: [NovelImportService],
  exports: [NovelImportService],
})
export class NovelImportModule {}
