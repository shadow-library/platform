import { Module } from '@shadow-library/app';

import { FederationModule } from '@server/modules/auth/federation';
import { KeyModule } from '@server/modules/auth/keys';
import { OAuthModule } from '@server/modules/auth/oauth';
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

@Module({
  imports: [DatabaseModule, KeyModule, OAuthModule, SessionModule, CredentialsModule, UserModule, AuditModule, NotificationModule, FederationModule],
  controllers: [MfaController, WebauthnController],
  providers: [MfaService, RecoveryCodeService, WebauthnService],
  exports: [MfaService, RecoveryCodeService, WebauthnService],
})
export class MfaModule {}
