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
import { BootstrapModule } from './modules/bootstrap';
import { DatastoreModule } from './modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A headless module graph (no HTTP server) used to run the platform bootstrap against a
 * database: at real startup it is part of AppModule, and template/seed scripts boot this
 * directly so tests clone an already-provisioned database.
 */

@Module({
  imports: [DatastoreModule, BootstrapModule],
})
export class SeedModule {}
