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
import { AiModule } from '../ai/ai.module';
import { SkeletonService } from './skeleton.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, AiModule],
  providers: [SkeletonService],
  exports: [SkeletonService],
})
export class PlanningModule {}
