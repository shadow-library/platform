import { Module } from '@shadow-library/app';

import { AuthzModule } from '@server/modules/authz';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { LogSamplerModule, SecurityModule } from '@server/modules/infrastructure/security';
import { ApplicationModule } from '@server/modules/system/application';

import { BotActivityService } from './bot-activity.service';
import { BotKeyExchangeService } from './bot-key-exchange.service';
import { BotKeyService } from './bot-key.service';
import { BotPermissionController } from './bot-permission.controller';
import { BotPermissionService } from './bot-permission.service';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [DatabaseModule, AuditModule, ApplicationModule, SecurityModule, LogSamplerModule, AuthzModule],
  controllers: [BotController, BotPermissionController],
  providers: [BotService, BotKeyService, BotKeyExchangeService, BotPermissionService, BotActivityService],
  exports: [BotService, BotKeyService, BotKeyExchangeService, BotPermissionService, BotActivityService],
})
export class BotModule {}
