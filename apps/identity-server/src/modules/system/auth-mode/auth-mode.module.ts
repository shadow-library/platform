import { Module } from '@shadow-library/app';

import { FederationModule } from '@server/modules/auth/federation';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { AuthModeService } from './auth-mode.service';

@Module({
  imports: [DatabaseModule, FederationModule],
  providers: [AuthModeService],
  exports: [AuthModeService],
})
export class AuthModeModule {}
