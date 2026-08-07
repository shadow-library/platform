import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { WebhookModule } from '@server/modules/infrastructure/webhook';

import { AuditService } from './audit.service';

@Module({
  imports: [DatabaseModule, WebhookModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
