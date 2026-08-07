import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { SessionAuthService } from './session-auth.service';
import { SessionService } from './session.service';

@Module({
  imports: [DatabaseModule],
  providers: [SessionService, SessionAuthService],
  exports: [SessionService, SessionAuthService],
})
export class SessionModule {}
