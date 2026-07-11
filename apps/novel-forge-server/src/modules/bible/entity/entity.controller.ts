/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { CreateEntityBody, EntityKeyParams, EntityProjectParams, EntityResponse, ListEntitiesQuery, ListEntityResponse, UpdateEntityBody, UploadImageBody } from './entity.dto';
import { EntityService } from './entity.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId/entities')
export class EntityController {
  constructor(private readonly entityService: EntityService) {}

  @Post()
  @RespondFor(201, EntityResponse)
  createEntity(@Params() params: EntityProjectParams, @Body() body: CreateEntityBody): Promise<EntityResponse> {
    return this.entityService.create(params.projectId, body) as unknown as Promise<EntityResponse>;
  }

  @Get()
  @RespondFor(200, ListEntityResponse)
  listEntities(@Params() params: EntityProjectParams, @Query() query: ListEntitiesQuery): Promise<ListEntityResponse> {
    return this.entityService.list(params.projectId, query) as unknown as Promise<ListEntityResponse>;
  }

  @Get('/:entityKey')
  @RespondFor(200, EntityResponse)
  async getEntity(@Params() params: EntityKeyParams): Promise<EntityResponse> {
    const entity = await this.entityService.get(params.projectId, params.entityKey);
    if (!entity) throw new ServerError(AppErrorCode.ENT_001);
    return entity as unknown as EntityResponse;
  }

  @Patch('/:entityKey')
  @RespondFor(200, EntityResponse)
  updateEntity(@Params() params: EntityKeyParams, @Body() body: UpdateEntityBody): Promise<EntityResponse> {
    return this.entityService.update(params.projectId, params.entityKey, body) as unknown as Promise<EntityResponse>;
  }

  @Delete('/:entityKey')
  @HttpStatus(204)
  deleteEntity(@Params() params: EntityKeyParams): Promise<void> {
    return this.entityService.delete(params.projectId, params.entityKey);
  }

  @Post('/:entityKey/image')
  @RespondFor(200, EntityResponse)
  uploadImage(@Params() params: EntityKeyParams, @Body() body: UploadImageBody): Promise<EntityResponse> {
    return this.entityService.setImage(params.projectId, params.entityKey, body.image, body.mime) as unknown as Promise<EntityResponse>;
  }

  @Delete('/:entityKey/image')
  @RespondFor(200, EntityResponse)
  deleteImage(@Params() params: EntityKeyParams): Promise<EntityResponse> {
    return this.entityService.clearImage(params.projectId, params.entityKey) as unknown as Promise<EntityResponse>;
  }
}
