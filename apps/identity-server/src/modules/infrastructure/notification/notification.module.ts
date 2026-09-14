import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ServiceTokenModule } from '@server/modules/infrastructure/service-token';

import { NotificationTokenService } from './notification-token.service';
import { NotificationClient } from './notification.client';
import { NotificationService } from './notification.service';

@Module({
  imports: [DatabaseModule, ServiceTokenModule],
  providers: [NotificationTokenService, NotificationClient, NotificationService],
  exports: [NotificationService, NotificationClient, NotificationTokenService],
})
export class NotificationModule {}
