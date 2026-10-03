import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { JobHandlerRegistryModule } from '../jobs/job-handler-registry.module';
import { JobsModule } from '../jobs/jobs.module';
import { PluginsModule } from '../plugins/plugins.module';
import { RefinementModule } from '../refinement/refinement.module';
import { BibleAuditController } from './bible-audit.controller';
import { BibleAuditService } from './bible-audit.service';
import { ChapterCanonRefreshService } from './chapter-canon-refresh.service';

@Module({
  imports: [DatabaseModule, AiModule, JobHandlerRegistryModule, JobsModule, PluginsModule, RefinementModule],
  controllers: [BibleAuditController],
  providers: [BibleAuditService, ChapterCanonRefreshService],
  exports: [BibleAuditService, ChapterCanonRefreshService],
})
export class BibleAuditModule {}
