import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { TelemetryModule } from '@server/telemetry';

import { CommandBus } from './command-bus.service';
import { CommandLogRepository } from './command-log.repository';
import { HeroLedger } from './hero-ledger.service';

@Module({
  imports: [DatabaseModule, TelemetryModule],
  providers: [CommandLogRepository, HeroLedger, CommandBus],
  exports: [CommandBus, HeroLedger],
})
export class CommandsModule {}
