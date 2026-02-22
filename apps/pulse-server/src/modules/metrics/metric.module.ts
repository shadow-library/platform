/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DashboardController } from './dashboard.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  controllers: [DashboardController],
})
export class MetricsModule {}
