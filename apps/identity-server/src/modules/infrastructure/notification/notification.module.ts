import { Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { PULSE_TARGET, PulseClient } from '@shadow-library/internal-api/pulse';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { serviceFetchFrom, ServiceTokenModule, ServiceTokenService } from '@server/modules/infrastructure/service-token';

import { NotificationClient } from './notification.client';
import { NotificationService } from './notification.service';

const pulseClient = (tokens: ServiceTokenService): PulseClient => new PulseClient(serviceFetchFrom(tokens), { ...PULSE_TARGET, resource: Config.get('notification.audience') });

@Module({
  imports: [DatabaseModule, ServiceTokenModule],
  providers: [{ token: PulseClient, useFactory: pulseClient, inject: [ServiceTokenService] }, NotificationClient, NotificationService],
  exports: [NotificationService, NotificationClient],
})
export class NotificationModule {}
