/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { CredentialsModule } from '@server/modules/identity/credentials';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';

import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { RecoveryCodeService } from './recovery-code.service';
import { WebauthnController } from './webauthn.controller';
import { WebauthnService } from './webauthn.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, KeyModule, SessionModule, CredentialsModule, UserModule, AuditModule, NotificationModule],
  controllers: [MfaController, WebauthnController],
  providers: [MfaService, RecoveryCodeService, WebauthnService],
  exports: [MfaService, RecoveryCodeService, WebauthnService],
})
export class MfaModule {}
