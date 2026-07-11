/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatastoreModule } from '@server/modules/infrastructure/datastore';

import { HealthController } from './health.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatastoreModule],
  controllers: [HealthController],
})
export class HealthModule {}
