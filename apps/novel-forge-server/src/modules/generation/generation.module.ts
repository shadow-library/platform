/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ChapterImageController } from './chapter-image.controller';
import { ChapterImageService } from './chapter-image.service';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, AiModule, JobsModule, RefinementModule, StorageModule],
  controllers: [GenerationController, ChapterImageController],
  providers: [GenerationService, ChapterImageService],
  exports: [GenerationService],
})
export class GenerationModule {}
