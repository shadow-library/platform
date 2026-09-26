import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { AuthoringClaimModule } from '../jobs/authoring-claim.module';
import { JobsModule } from '../jobs/jobs.module';
import { PluginProposalModule } from '../plugins/plugin-proposal.module';
import { PluginsModule } from '../plugins/plugins.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ChapterAmendController } from './chapter-amend.controller';
import { ChapterAmendService } from './chapter-amend.service';
import { ChapterImageController } from './chapter-image.controller';
import { ChapterImageService } from './chapter-image.service';
import { ChapterInsertController } from './chapter-insert.controller';
import { ChapterInsertService } from './chapter-insert.service';
import { ChapterRowsController } from './chapter-rows.controller';
import { ChapterRowsService } from './chapter-rows.service';
import { ChapterWorkspaceController } from './chapter-workspace.controller';
import { DraftVersionService } from './draft-versions.service';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { PassageRewriteService } from './passage-rewrite.service';
import { WriterSnapshotController } from './writer-snapshot.controller';

@Module({
  imports: [DatabaseModule, AiModule, AuthoringClaimModule, JobsModule, PluginsModule, PluginProposalModule, RefinementModule, StorageModule],
  controllers: [
    GenerationController,
    ChapterImageController,
    ChapterInsertController,
    ChapterAmendController,
    ChapterRowsController,
    WriterSnapshotController,
    ChapterWorkspaceController,
  ],
  providers: [GenerationService, ChapterImageService, ChapterInsertService, ChapterAmendService, ChapterRowsService, DraftVersionService, PassageRewriteService],
  exports: [GenerationService, ChapterImageService, ChapterInsertService, ChapterAmendService],
})
export class GenerationModule {}
