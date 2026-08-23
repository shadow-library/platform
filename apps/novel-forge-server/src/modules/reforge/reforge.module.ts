import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { ReforgeAnalysisService } from './reforge-analysis.service';
import { ReforgeCutService } from './reforge-cut.service';
import { ReforgePlanService } from './reforge-plan.service';
import { ReforgePromoteService } from './reforge-promote.service';
import { ReforgeService } from './reforge.service';

// ReforgeService is pure CRUD over the reforge tables; the transform analysis stage needs the AI
// subsystem, so AiModule is imported here exactly as RebrandModule does. The rename-bible seed and the
// per-chapter graph still run from the job executor via the already-wired RebrandService/
// WorkflowRunService. The reforge controller lives in PipelineModule (the HTTP seam), keeping the
// module graph acyclic (Rebrand and Ai never import Reforge).
@Module({
  imports: [DatabaseModule, AiModule],
  providers: [ReforgeService, ReforgeAnalysisService, ReforgeCutService, ReforgePlanService, ReforgePromoteService],
  exports: [ReforgeService, ReforgeAnalysisService, ReforgeCutService, ReforgePlanService, ReforgePromoteService],
})
export class ReforgeModule {}
