/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { SamlKeyService } from './saml-key.service';
import { SamlController } from './saml.controller';
import { SamlService } from './saml.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, KeyModule, SessionModule, UserModule, AuditModule],
  controllers: [SamlController],
  providers: [SamlKeyService, SamlService],
  exports: [SamlKeyService, SamlService],
})
export class SamlModule {}
