import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { ReforgeService } from './reforge.service';

// ReforgeService is pure CRUD over the reforge tables — the rename-bible seed and per-chapter graph run
// from the job executor via the already-wired RebrandService/WorkflowRunService, so no AiModule or
// RebrandModule import is needed here. The reforge controller lives in PipelineModule (the HTTP seam),
// keeping the module graph acyclic (Rebrand never imports Reforge).
@Module({
  imports: [DatabaseModule],
  providers: [ReforgeService],
  exports: [ReforgeService],
})
export class ReforgeModule {}
