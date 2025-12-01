/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatastoreService } from './datastore.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  providers: [DatastoreService],
  exports: [DatastoreService],
})
export class DatastoreModule {}
