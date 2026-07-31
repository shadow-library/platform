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
import { DatastoreModule } from './modules/infrastructure/datastore';
import { WorkerModule } from './modules/worker';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The worker process runs the background job loops (notification dispatch, expiry sweeps) without
 * an HTTP server, so it scales and deploys independently of the API.
 */

@Module({
  imports: [DatastoreModule, WorkerModule],
})
export class WorkerAppModule {}
