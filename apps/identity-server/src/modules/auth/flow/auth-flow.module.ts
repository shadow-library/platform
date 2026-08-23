import { Module } from '@shadow-library/app';

import { FederationModule } from '@server/modules/auth/federation';
import { MfaModule } from '@server/modules/auth/mfa';
import { OAuthModule } from '@server/modules/auth/oauth';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { CredentialsModule } from '@server/modules/identity/credentials';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { SecurityModule } from '@server/modules/infrastructure/security';
import { AuthModeModule } from '@server/modules/system/auth-mode';

import { AuthFlowService } from './auth-flow.service';
import { AuthMethodsController } from './auth-methods.controller';
import { AuthController } from './auth.controller';
import { ChallengeFlowService } from './challenge-flow.service';
import { ChallengeService } from './challenge.service';
import { FederatedController } from './federated.controller';
import { FederatedStepUpService } from './federated-step-up.service';
import { LoginService } from './login.service';
import { MeSessionsController } from './me-sessions.controller';
import { MeSessionsService } from './me-sessions.service';
import { RecoveryService } from './recovery.service';
import { RegistrationService } from './registration.service';
import { SignInEventService } from './sign-in-event.service';
import { SocialLoginService } from './social-login.service';
import { SuspiciousLoginService } from './suspicious-login.service';

@Module({
  imports: [
    DatabaseModule,
    UserModule,
    CredentialsModule,
    SessionModule,
    TokenModule,
    MfaModule,
    AuditModule,
    NotificationModule,
    SecurityModule,
    FederationModule,
    OAuthModule,
    AuthzModule,
    OrganisationModule,
    AuthModeModule,
  ],
  controllers: [AuthController, AuthMethodsController, MeSessionsController, FederatedController],
  providers: [
    AuthFlowService,
    SignInEventService,
    ChallengeService,
    ChallengeFlowService,
    SuspiciousLoginService,
    LoginService,
    RegistrationService,
    RecoveryService,
    MeSessionsService,
    SocialLoginService,
    FederatedStepUpService,
  ],
  exports: [
    AuthFlowService,
    SignInEventService,
    ChallengeService,
    ChallengeFlowService,
    SuspiciousLoginService,
    LoginService,
    RegistrationService,
    RecoveryService,
    SocialLoginService,
    FederatedStepUpService,
  ],
})
export class AuthFlowModule {}
