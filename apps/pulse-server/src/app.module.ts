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
import { HttpRouteModule } from './routes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [HttpRouteModule],
})
export class AppModule {}
