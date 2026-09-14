import { Module } from '@shadow-library/app';

import { TokenModule } from '@server/modules/auth/token';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';
/** Deep import, not the barrel: its `export *` would evaluate the HTTP middlewares and pull Fastify into the worker process */
import { LogSamplerModule } from '@server/modules/infrastructure/security/log-sampler.module';
import { WebhookModule } from '@server/modules/infrastructure/webhook';

import { BotKeyExpiryService } from './bot-key-expiry.service';
import { MaintenanceService } from './maintenance.service';
import { WorkerService } from './worker.service';

@Module({
  imports: [DatabaseModule, NotificationModule, TokenModule, WebhookModule, AuditModule, LogSamplerModule],
  providers: [WorkerService, MaintenanceService, BotKeyExpiryService],
})
export class WorkerModule {}
