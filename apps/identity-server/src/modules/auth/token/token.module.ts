import { Module } from '@shadow-library/app';

import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { PolicyModule } from '@server/modules/system/policy';

import { BackChannelLogoutService } from './backchannel-logout.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [DatabaseModule, SessionModule, AuditModule, KeyModule, PolicyModule],
  providers: [RefreshTokenService, BackChannelLogoutService],
  exports: [RefreshTokenService, BackChannelLogoutService],
})
export class TokenModule {}
