import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { TelemetryModule } from '@server/telemetry';

import { CommandBus } from './command-bus.service';
import { CommandLogRepository } from './command-log.repository';
import { HeroLedger } from './hero-ledger.service';
import { RolloverGate } from './rollover-gate';

@Module({
  imports: [DatabaseModule, TelemetryModule],
  providers: [CommandLogRepository, HeroLedger, RolloverGate, CommandBus],
  exports: [CommandBus, CommandLogRepository, HeroLedger, RolloverGate],
})
export class CommandsModule {}
