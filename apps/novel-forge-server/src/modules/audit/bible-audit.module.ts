import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { PluginsModule } from '../plugins/plugins.module';
import { RefinementModule } from '../refinement/refinement.module';
import { BibleAuditController } from './bible-audit.controller';
import { BibleAuditService } from './bible-audit.service';

@Module({
  imports: [DatabaseModule, AiModule, JobsModule, PluginsModule, RefinementModule],
  controllers: [BibleAuditController],
  providers: [BibleAuditService],
  exports: [BibleAuditService],
})
export class BibleAuditModule {}
