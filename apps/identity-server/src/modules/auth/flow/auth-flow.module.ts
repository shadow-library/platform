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

import { AuthFlowService } from './auth-flow.service';
import { AuthController } from './auth.controller';
import { LoginService } from './login.service';
import { SignInEventService } from './sign-in-event.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, UserModule, CredentialsModule, SessionModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthFlowService, SignInEventService, LoginService],
  exports: [AuthFlowService, SignInEventService, LoginService],
})
export class AuthFlowModule {}
