import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { AuthModule } from '@shadow-library/auth/module';
import { fromAuthClient } from '@shadow-library/clients';
import { PulseClient } from '@shadow-library/clients/pulse';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SchedulerModule } from '@modules/scheduler';
import { DatastoreModule } from '@server/database';

import { BillingReminderRepository } from './billing-reminder.repository';
import { BillingReminderSweepService } from './billing-reminder-sweep.service';
import { NotificationClient } from './notification-client.service';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { NotificationSenderService } from './notification-sender.service';
import { HttpPulseTransport, PulseTransport } from './pulse-transport';
import { WeeklyDigestSweepService } from './weekly-digest-sweep.service';
import { WeeklyDigestRepository } from './weekly-digest.repository';

/** `AuthModule` is imported as a bare class, not a second `forRoot` call: `MemoirAuthModule` already binds it, and a dynamic module is configured once per graph. */
@Module({
  imports: [AuthModule, DatabaseModule, DatastoreModule, MemoirAuthModule, SchedulerModule],
  providers: [
    NotificationOutboxRepository,
    NotificationClient,
    { token: PulseClient, useFactory: (authClient: AuthClient) => new PulseClient(fromAuthClient(authClient)), inject: [AuthClient] },
    { token: PulseTransport, useClass: HttpPulseTransport },
    NotificationSenderService,
    BillingReminderRepository,
    BillingReminderSweepService,
    WeeklyDigestRepository,
    WeeklyDigestSweepService,
  ],
  exports: [NotificationClient, NotificationOutboxRepository, NotificationSenderService, PulseTransport, BillingReminderSweepService, WeeklyDigestSweepService],
})
export class NotificationsModule {}
