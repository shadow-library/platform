import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { LedgerModule } from '../ledger/ledger.module';
import { NotesStoreService } from './notes-store.service';

@Module({
  imports: [DatabaseModule, LedgerModule],
  providers: [NotesStoreService],
  exports: [NotesStoreService],
})
export class NotesStoreModule {}
