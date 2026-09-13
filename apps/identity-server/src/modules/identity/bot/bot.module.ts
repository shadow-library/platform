import { Module } from '@shadow-library/app';

import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { SecurityModule } from '@server/modules/infrastructure/security';
import { ApplicationModule } from '@server/modules/system/application';

import { BotKeyExchangeService } from './bot-key-exchange.service';
import { BotKeyService } from './bot-key.service';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [DatabaseModule, AuditModule, ApplicationModule, SecurityModule],
  controllers: [BotController],
  providers: [BotService, BotKeyService, BotKeyExchangeService],
  exports: [BotService, BotKeyService, BotKeyExchangeService],
})
export class BotModule {}
