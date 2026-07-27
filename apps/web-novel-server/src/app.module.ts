/**
 * Importing packages with side effects
 */
import './bootstrap';

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatastoreModule } from './modules/datastore';
import { HttpRouteModule } from './routes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The configured datastore (forRoot) is imported exactly once at the root; feature modules
 * import the bare `DatabaseModule` class to access the shared, configured `DatabaseService`.
 */

@Module({
  imports: [DatastoreModule, HttpRouteModule],
})
export class AppModule {}
