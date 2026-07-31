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
import { KeyModule } from './modules/auth/keys';
import { SamlKeyService } from './modules/auth/saml';
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
  /** SamlKeyService rides along so the template database carries a ready SAML key beside the OIDC one. */
  imports: [DatastoreModule, KeyModule, BootstrapModule],
  providers: [SamlKeyService],
})
export class SeedModule {}
