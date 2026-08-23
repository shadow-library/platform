import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ChapterImageController } from './chapter-image.controller';
import { ChapterImageService } from './chapter-image.service';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [DatabaseModule, AiModule, JobsModule, RefinementModule, StorageModule],
  controllers: [GenerationController, ChapterImageController],
  providers: [GenerationService, ChapterImageService],
  exports: [GenerationService, ChapterImageService],
})
export class GenerationModule {}
