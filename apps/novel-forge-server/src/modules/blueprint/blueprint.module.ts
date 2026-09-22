import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { LedgerController } from './ledger/ledger.controller';
import { LedgerService } from './ledger/ledger.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class BlueprintModule {}
