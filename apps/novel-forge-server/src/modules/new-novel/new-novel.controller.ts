import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import {
  CreateNovelWithNotesBody,
  CreateNovelWithNotesResponse,
  NewNovelProjectParams,
  NotesResponse,
  ProgressKeyParams,
  ProgressOverrideBody,
  ProgressResponse,
  UpdateNotesBody,
} from './new-novel.dto';
import { NewNovelService } from './new-novel.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects')
export class NewNovelController {
  constructor(private readonly newNovelService: NewNovelService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/new-novel')
  @RespondFor(201, CreateNovelWithNotesResponse)
  createNovelWithNotes(@Body() body: CreateNovelWithNotesBody): Promise<CreateNovelWithNotesResponse> {
    return this.newNovelService.createWithNotes(body);
  }

  @Get('/:projectId/notes')
  @RespondFor(200, NotesResponse)
  getNotes(@Params() params: NewNovelProjectParams): Promise<NotesResponse> {
    return this.newNovelService.getNotes(params.projectId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Put('/:projectId/notes')
  @HttpStatus(204)
  updateNotes(@Params() params: NewNovelProjectParams, @Body() body: UpdateNotesBody): Promise<void> {
    return this.newNovelService.updateNotes(params.projectId, body);
  }

  @Get('/:projectId/progress')
  @RespondFor(200, ProgressResponse)
  getProgress(@Params() params: NewNovelProjectParams): Promise<ProgressResponse> {
    return this.newNovelService.progress(params.projectId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Put('/:projectId/progress/:key')
  @RespondFor(200, ProgressResponse)
  setProgressOverride(@Params() params: ProgressKeyParams, @Body() body: ProgressOverrideBody): Promise<ProgressResponse> {
    return this.newNovelService.setProgressOverride(params.projectId, params.key, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/:projectId/progress/:key')
  @RespondFor(200, ProgressResponse)
  clearProgressOverride(@Params() params: ProgressKeyParams): Promise<ProgressResponse> {
    return this.newNovelService.clearProgressOverride(params.projectId, params.key);
  }
}
