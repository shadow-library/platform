import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { PasswordPolicyService } from './password-policy.service';
import { PasswordService } from './password.service';

@Module({
  imports: [DatabaseModule],
  providers: [PasswordService, PasswordPolicyService],
  exports: [PasswordService, PasswordPolicyService],
})
export class CredentialsModule {}
