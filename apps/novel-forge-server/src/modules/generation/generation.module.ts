import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ChapterAmendController } from './chapter-amend.controller';
import { ChapterAmendService } from './chapter-amend.service';
import { ChapterImageController } from './chapter-image.controller';
import { ChapterImageService } from './chapter-image.service';
import { ChapterInsertController } from './chapter-insert.controller';
import { ChapterInsertService } from './chapter-insert.service';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [DatabaseModule, AiModule, JobsModule, RefinementModule, StorageModule],
  controllers: [GenerationController, ChapterImageController, ChapterInsertController, ChapterAmendController],
  providers: [GenerationService, ChapterImageService, ChapterInsertService, ChapterAmendService],
  exports: [GenerationService, ChapterImageService, ChapterInsertService, ChapterAmendService],
})
export class GenerationModule {}
