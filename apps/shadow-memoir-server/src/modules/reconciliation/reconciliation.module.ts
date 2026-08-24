import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { SchedulerModule } from '@modules/scheduler';

import { ReconciliationRepository } from './reconciliation.repository';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [DatabaseModule, SchedulerModule],
  providers: [ReconciliationRepository, ReconciliationService],
  exports: [ReconciliationRepository, ReconciliationService],
})
export class ReconciliationModule {}
