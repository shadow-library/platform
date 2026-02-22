/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import {
  CreateTemplateGroupBody,
  ListTemplateGroupResponse,
  ListTemplateGroupsQuery,
  TemplateGroupParams,
  TemplateGroupResponse,
  UpdateTemplateGroupBody,
} from './template-group.dto';
import { TemplateGroupService } from './template-group.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/template-groups')
export class TemplateGroupController {
  constructor(private readonly templateGroupService: TemplateGroupService) {}

  @Post()
  @RespondFor(201, TemplateGroupResponse)
  createTemplateGroup(@Body() body: CreateTemplateGroupBody): Promise<TemplateGroupResponse> {
    return this.templateGroupService.createTemplateGroup(body);
  }

  @Get()
  @RespondFor(200, ListTemplateGroupResponse)
  listTemplateGroups(@Query() query: ListTemplateGroupsQuery): Promise<ListTemplateGroupResponse> {
    return this.templateGroupService.listTemplateGroups(query);
  }

  @Get('/:groupId')
  @RespondFor(200, TemplateGroupResponse)
  async getTemplateGroup(@Params() params: TemplateGroupParams): Promise<TemplateGroupResponse> {
    const templateGroup = await this.templateGroupService.getTemplateGroup(params.groupId);
    if (!templateGroup) throw new ServerError(AppErrorCode.TPL_GRP_001);
    return templateGroup;
  }

  @Patch('/:groupId')
  @RespondFor(200, TemplateGroupResponse)
  updateTemplateGroup(@Params() params: TemplateGroupParams, @Body() body: UpdateTemplateGroupBody): Promise<TemplateGroupResponse> {
    return this.templateGroupService.updateTemplateGroup(params.groupId, body);
  }
}
