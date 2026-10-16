import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { SYSTEM_TIMERS } from '@modules/catalog';

import { LedgerRetentionService, METERING_TIMERS } from './ledger-retention.service';
import { MeteringRepository } from './metering.repository';
import { MeteringService } from './metering.service';

@Module({
  imports: [DatabaseModule],
  providers: [{ token: METERING_TIMERS, useValue: SYSTEM_TIMERS }, MeteringRepository, MeteringService, LedgerRetentionService],
  exports: [MeteringService],
})
export class MeteringModule {}
