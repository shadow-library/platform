import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { ILLUSTRATIONS_WRITE_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import {
  AddEntityImageBody,
  CreateEntityBody,
  DateEntityImageBody,
  EntityImageParams,
  EntityKeyParams,
  EntityProjectParams,
  EntityResponse,
  ListEntitiesQuery,
  ListEntityResponse,
  TimelineResponse,
  UpdateEntityBody,
  UploadImageBody,
} from './entity.dto';
import { EntityService } from './entity.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/entities')
export class EntityController {
  constructor(private readonly entityService: EntityService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post()
  @RespondFor(201, EntityResponse)
  createEntity(@Params() params: EntityProjectParams, @Body() body: CreateEntityBody): Promise<EntityResponse> {
    return this.entityService.create(params.projectId, body);
  }

  @Get()
  @RespondFor(200, ListEntityResponse)
  listEntities(@Params() params: EntityProjectParams, @Query() query: ListEntitiesQuery): Promise<ListEntityResponse> {
    return this.entityService.list(params.projectId, query);
  }

  @Get('/:entityKey')
  @RespondFor(200, EntityResponse)
  async getEntity(@Params() params: EntityKeyParams): Promise<EntityResponse> {
    const entity = await this.entityService.get(params.projectId, params.entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();
    return entity;
  }

  @Get('/:entityKey/timeline')
  @RespondFor(200, TimelineResponse)
  async getTimeline(@Params() params: EntityKeyParams): Promise<TimelineResponse> {
    const events = await this.entityService.timeline(params.projectId, params.entityKey);
    return { events };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:entityKey')
  @RespondFor(200, EntityResponse)
  updateEntity(@Params() params: EntityKeyParams, @Body() body: UpdateEntityBody): Promise<EntityResponse> {
    return this.entityService.update(params.projectId, params.entityKey, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/:entityKey')
  @HttpStatus(204)
  deleteEntity(@Params() params: EntityKeyParams): Promise<void> {
    return this.entityService.delete(params.projectId, params.entityKey);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Post('/:entityKey/image')
  @RespondFor(200, EntityResponse)
  uploadImage(@Params() params: EntityKeyParams, @Body() body: UploadImageBody): Promise<EntityResponse> {
    return this.entityService.setImage(params.projectId, params.entityKey, body.image, body.mime, body.depictsChapter);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Patch('/:entityKey/image')
  @RespondFor(200, EntityResponse)
  datePortrait(@Params() params: EntityKeyParams, @Body() body: DateEntityImageBody): Promise<EntityResponse> {
    return this.entityService.datePortrait(params.projectId, params.entityKey, body.depictsChapter);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Delete('/:entityKey/image')
  @RespondFor(200, EntityResponse)
  deleteImage(@Params() params: EntityKeyParams): Promise<EntityResponse> {
    return this.entityService.clearImage(params.projectId, params.entityKey);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Post('/:entityKey/images')
  @RespondFor(201, EntityResponse)
  @HttpStatus(201)
  addImage(@Params() params: EntityKeyParams, @Body() body: AddEntityImageBody): Promise<EntityResponse> {
    return this.entityService.addImage(params.projectId, params.entityKey, body.image, body.mime, body.caption, body.depictsChapter);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Patch('/:entityKey/images/:imageId')
  @RespondFor(200, EntityResponse)
  dateImage(@Params() params: EntityImageParams, @Body() body: DateEntityImageBody): Promise<EntityResponse> {
    return this.entityService.dateImage(params.projectId, params.entityKey, params.imageId, body.depictsChapter);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Delete('/:entityKey/images/:imageId')
  @RespondFor(200, EntityResponse)
  removeImage(@Params() params: EntityImageParams): Promise<EntityResponse> {
    return this.entityService.deleteImageById(params.projectId, params.entityKey, params.imageId);
  }
}
