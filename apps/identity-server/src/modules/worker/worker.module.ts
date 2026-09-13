import { Module } from '@shadow-library/app';

import { TokenModule } from '@server/modules/auth/token';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { WebhookModule } from '@server/modules/infrastructure/webhook';

import { BotKeyExpiryService } from './bot-key-expiry.service';
import { MaintenanceService } from './maintenance.service';
import { WorkerService } from './worker.service';

@Module({
  imports: [DatabaseModule, NotificationModule, TokenModule, WebhookModule, AuditModule],
  providers: [WorkerService, MaintenanceService, BotKeyExpiryService],
})
export class WorkerModule {}
