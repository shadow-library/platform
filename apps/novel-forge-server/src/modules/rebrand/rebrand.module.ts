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
import { RebrandService } from './rebrand.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// No JobsModule import here — JobsModule imports THIS module for the executor, and the rebrand
// controller lives in PipelineModule (the HTTP-wiring seam), keeping the module graph acyclic.
@Module({
  imports: [DatabaseModule, AiModule],
  providers: [RebrandService],
  exports: [RebrandService],
})
export class RebrandModule {}
