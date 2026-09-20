import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SchedulerModule } from '@modules/scheduler';

import { ExportAssemblerService } from './export-assembler.service';
import { ExportAssemblyRepository } from './export-assembly.repository';
import { ExportJobRepository } from './export-job.repository';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

/**
 * `StorageModule` is imported as a bare class, not a second `forRoot` call: a dynamic module may be
 * configured once per application graph, and `ReceiptsModule` already binds it (same convention as
 * `DeletionModule`) — the graph composer (`routes.module.ts`, or a test's own `TestHttpModule`) is
 * responsible for including `ReceiptsModule` too, so its dynamic registration exists somewhere in the
 * graph before this bare reference resolves.
 */
@Module({
  imports: [DatabaseModule, MemoirAuthModule, SchedulerModule, StorageModule],
  controllers: [ExportController],
  providers: [ExportJobRepository, ExportAssemblyRepository, ExportService, ExportAssemblerService],
  exports: [ExportJobRepository, ExportAssemblyRepository, ExportService, ExportAssemblerService],
})
export class ExportModule {}
