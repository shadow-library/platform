import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import {
  AddEntityImageBody,
  CreateEntityBody,
  EntityImageParams,
  EntityKeyParams,
  EntityProjectParams,
  EntityResponse,
  ListEntitiesQuery,
  ListEntityResponse,
  UpdateEntityBody,
  UploadImageBody,
} from './entity.dto';
import { EntityService } from './entity.service';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/entities')
export class EntityController {
  constructor(private readonly entityService: EntityService) {}

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

  @Patch('/:entityKey')
  @RespondFor(200, EntityResponse)
  updateEntity(@Params() params: EntityKeyParams, @Body() body: UpdateEntityBody): Promise<EntityResponse> {
    return this.entityService.update(params.projectId, params.entityKey, body);
  }

  @Delete('/:entityKey')
  @HttpStatus(204)
  deleteEntity(@Params() params: EntityKeyParams): Promise<void> {
    return this.entityService.delete(params.projectId, params.entityKey);
  }

  @Post('/:entityKey/image')
  @RespondFor(200, EntityResponse)
  uploadImage(@Params() params: EntityKeyParams, @Body() body: UploadImageBody): Promise<EntityResponse> {
    return this.entityService.setImage(params.projectId, params.entityKey, body.image, body.mime);
  }

  @Delete('/:entityKey/image')
  @RespondFor(200, EntityResponse)
  deleteImage(@Params() params: EntityKeyParams): Promise<EntityResponse> {
    return this.entityService.clearImage(params.projectId, params.entityKey);
  }

  @Post('/:entityKey/images')
  @RespondFor(201, EntityResponse)
  @HttpStatus(201)
  addImage(@Params() params: EntityKeyParams, @Body() body: AddEntityImageBody): Promise<EntityResponse> {
    return this.entityService.addImage(params.projectId, params.entityKey, body.image, body.mime, body.caption);
  }

  @Delete('/:entityKey/images/:imageId')
  @RespondFor(200, EntityResponse)
  removeImage(@Params() params: EntityImageParams): Promise<EntityResponse> {
    return this.entityService.deleteImageById(params.projectId, params.entityKey, params.imageId);
  }
}
