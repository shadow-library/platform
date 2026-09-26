import { Module } from '@shadow-library/app';

import { NotesController } from './notes.controller';
import { NotesStoreModule } from './notes-store.module';

@Module({
  imports: [NotesStoreModule],
  controllers: [NotesController],
})
export class NotesModule {}
