import { Module } from '@shadow-library/app';

import { KeyModule } from '@server/modules/auth/keys';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { NotificationTokenService } from './notification-token.service';
import { NotificationClient } from './notification.client';
import { NotificationService } from './notification.service';

@Module({
  imports: [DatabaseModule, KeyModule],
  providers: [NotificationTokenService, NotificationClient, NotificationService],
  exports: [NotificationService, NotificationClient, NotificationTokenService],
})
export class NotificationModule {}
