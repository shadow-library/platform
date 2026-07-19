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
import { ContextBinder } from './modules/access';
import { BootstrapModule } from './modules/bootstrap';
import { DatastoreModule } from './modules/infrastructure/datastore';
import { HttpRouteModule } from './routes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The configured datastore (forRoot) is imported exactly once at the root; feature modules
 * import the bare `DatabaseModule` class to access the shared, configured `DatabaseService`.
 * `ContextBinder` lives here because the router's `ContextService` is only DI-visible at the root;
 * it binds that instance to the ambient `Context` used across controllers.
 */

@Module({
  imports: [DatastoreModule, HttpRouteModule, BootstrapModule],
  providers: [ContextBinder],
})
export class AppModule {}
