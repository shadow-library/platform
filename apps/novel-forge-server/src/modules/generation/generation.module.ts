import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ChapterImageController } from './chapter-image.controller';
import { ChapterImageService } from './chapter-image.service';
import { ChapterInsertController } from './chapter-insert.controller';
import { ChapterInsertService } from './chapter-insert.service';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [DatabaseModule, AiModule, JobsModule, RefinementModule, StorageModule],
  controllers: [GenerationController, ChapterImageController, ChapterInsertController],
  providers: [GenerationService, ChapterImageService, ChapterInsertService],
  exports: [GenerationService, ChapterImageService, ChapterInsertService],
})
export class GenerationModule {}
