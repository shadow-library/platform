/**
 * Importing packages with side effects
 */
import './bootstrap';

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { StorageModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { HttpRouteModule } from '@modules/dynamic.modules';

import { DatabaseModule } from './database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, StorageModule.forRoot(), HttpRouteModule],
})
export class AppModule {}
