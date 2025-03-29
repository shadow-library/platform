/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { HealthController } from './health.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
