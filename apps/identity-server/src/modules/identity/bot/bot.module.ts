import { Module } from '@shadow-library/app';

import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ApplicationModule } from '@server/modules/system/application';

import { BotKeyService } from './bot-key.service';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [DatabaseModule, AuditModule, ApplicationModule],
  controllers: [BotController],
  providers: [BotService, BotKeyService],
  exports: [BotService, BotKeyService],
})
export class BotModule {}
