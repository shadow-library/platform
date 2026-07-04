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
  providers: [ChapterService],
  exports: [ChapterService],
})
export class SourceModule {}
