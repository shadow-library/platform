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

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [ChapterController],
  providers: [ChapterService, AdapterRegistry, AcquireService, AssetService],
  exports: [ChapterService, AdapterRegistry, AcquireService, AssetService],
})
export class SourceModule {}
