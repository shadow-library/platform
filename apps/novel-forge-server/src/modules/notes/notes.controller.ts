import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { NotesProjectParams, SavedNotesResponse, SaveMessageAsNotesBody } from './notes.dto';
import { NotesStoreService } from './notes-store.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/notes')
export class NotesController {
  constructor(private readonly notesStore: NotesStoreService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/from-message')
  @RespondFor(200, SavedNotesResponse)
  saveMessage(@Params() params: NotesProjectParams, @Body() body: SaveMessageAsNotesBody): Promise<SavedNotesResponse> {
    return this.notesStore.saveMessage(params.projectId, body.sessionId, BigInt(body.messageId));
  }
}
