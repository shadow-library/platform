/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AcquireService } from './acquire.service';
import { AdapterRegistry } from './adapters/adapter.registry';
import { AssetService } from './asset.service';
import { ChapterController } from './chapter/chapter.controller';
import { ChapterService } from './chapter/chapter.service';
import { RecombineService } from './recombine.service';
import { AiModule } from '../ai/ai.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [ChapterController],
  providers: [ChapterService, AdapterRegistry, AcquireService, AssetService, RecombineService],
  exports: [ChapterService, AdapterRegistry, AcquireService, AssetService, RecombineService],
})
export class SourceModule {}
