import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { BotOwnershipController } from './bot-ownership.controller';
import { BotOwnershipService } from './bot-ownership.service';

@Module({
  imports: [DatabaseModule, FastifyModule],
  controllers: [BotOwnershipController],
  providers: [BotOwnershipService],
})
export class BotOwnershipModule {}
