/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { TemplateGroupService } from '@modules/template';
import { AppErrorCode } from '@server/classes';

import { CreateTemplateGroupBody, ListTemplateGroupsQuery, TemplateGroupDetailResponse, TemplateGroupParams, TemplateGroupResponse, UpdateTemplateGroupBody } from './dtos';

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
  @RespondFor(200, [TemplateGroupResponse])
  listTemplateGroups(@Query() query: ListTemplateGroupsQuery): Promise<TemplateGroupResponse[]> {
    const { key, ...pagination } = query;
    return this.templateGroupService.listTemplateGroups({ key }, pagination);
  }

  @Get('/:id')
  @RespondFor(200, TemplateGroupDetailResponse)
  async getTemplateGroup(@Params() params: TemplateGroupParams): Promise<TemplateGroupDetailResponse> {
    const templateGroup = await this.templateGroupService.getTemplateGroup(params.id);
    if (!templateGroup) throw new ServerError(AppErrorCode.TPL_GRP_001);
    return templateGroup;
  }

  @Patch('/:id')
  @RespondFor(200, TemplateGroupResponse)
  updateTemplateGroup(@Params() params: TemplateGroupParams, @Body() body: UpdateTemplateGroupBody): Promise<TemplateGroupResponse> {
    return this.templateGroupService.updateTemplateGroup(params.id, body);
  }
}
