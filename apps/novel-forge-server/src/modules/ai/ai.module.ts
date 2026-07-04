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
import { ModelRouterService } from './model-router.service';
import { TelemetryHandler } from './telemetry.handler';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [TelemetryHandler, ModelRouterService],
  exports: [ModelRouterService, TelemetryHandler],
})
export class AiModule {}
