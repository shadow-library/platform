/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { SessionModule } from '@server/modules/auth/session';
import { CredentialsModule } from '@server/modules/identity/credentials';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';

import { AuthFlowService } from './auth-flow.service';
import { AuthController } from './auth.controller';
import { ChallengeService } from './challenge.service';
import { LoginService } from './login.service';
import { RegistrationService } from './registration.service';
import { SignInEventService } from './sign-in-event.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, UserModule, CredentialsModule, SessionModule, AuditModule, NotificationModule],
  controllers: [AuthController],
  providers: [AuthFlowService, SignInEventService, ChallengeService, LoginService, RegistrationService],
  exports: [AuthFlowService, SignInEventService, ChallengeService, LoginService, RegistrationService],
})
export class AuthFlowModule {}
