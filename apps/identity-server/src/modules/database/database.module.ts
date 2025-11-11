/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseService } from './database.service';

/**
 * Defining types
 */

export type ID = string | bigint;

/**
 * Declaring the constants
 */

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
