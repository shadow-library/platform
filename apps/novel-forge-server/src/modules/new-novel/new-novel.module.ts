import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { LedgerModule } from '../ledger/ledger.module';
import { NotesStoreModule } from '../notes/notes-store.module';
import { ProjectModule } from '../project/project.module';
import { RefinementModule } from '../refinement/refinement.module';
import { NewNovelController } from './new-novel.controller';
import { NewNovelService } from './new-novel.service';

@Module({
  imports: [DatabaseModule, ProjectModule, LedgerModule, NotesStoreModule, RefinementModule],
  controllers: [NewNovelController],
  providers: [NewNovelService],
})
export class NewNovelModule {}
