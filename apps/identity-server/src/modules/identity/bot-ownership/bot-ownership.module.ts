import { Module } from '@shadow-library/app';

import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ServiceTokenModule } from '@server/modules/infrastructure/service-token';

import { BotApplicationService } from './bot-application.service';
import { BotOwnershipClient } from './bot-ownership.client';
import { BotOwnershipService } from './bot-ownership.service';

@Module({
  imports: [DatabaseModule, AuditModule, ServiceTokenModule],
  providers: [BotApplicationService, BotOwnershipClient, BotOwnershipService],
  exports: [BotApplicationService, BotOwnershipService],
})
export class BotOwnershipModule {}
