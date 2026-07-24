/**
 * Importing npm packages
 */
import { RequirePermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Patch, Post, Put, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PULSE_PERMISSIONS } from '@modules/auth';

import {
  ChannelParams,
  ChannelSettingResponse,
  CreateTemplateBody,
  ListTemplateResponse,
  ListTemplatesQuery,
  SetChannelSettingBody,
  TemplateDetailResponse,
  TemplateParams,
  TemplateResponse,
  UpdateTemplateBody,
} from './template.dto';
import { TemplateService } from './template.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @RespondFor(201, TemplateResponse)
  createTemplate(@Body() body: CreateTemplateBody): Promise<TemplateResponse> {
    return this.templateService.createTemplate(body);
  }

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, ListTemplateResponse)
  listTemplates(@Query() query: ListTemplatesQuery): Promise<ListTemplateResponse> {
    return this.templateService.listTemplates(query);
  }

  @Get('/:templateId')
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, TemplateDetailResponse)
  async getTemplate(@Params() params: TemplateParams): Promise<TemplateDetailResponse> {
    const template = await this.templateService.getTemplateOrThrow(params.templateId);
    const channels = await this.templateService.listChannelSettings(params.templateId);
    return { ...template, channels };
  }

  @Patch('/:templateId')
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @RespondFor(200, TemplateResponse)
  updateTemplate(@Params() params: TemplateParams, @Body() body: UpdateTemplateBody): Promise<TemplateResponse> {
    return this.templateService.updateTemplate(params.templateId, body);
  }

  @Put('/:templateId/channels/:channel')
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @RespondFor(200, ChannelSettingResponse)
  setChannel(@Params() params: ChannelParams, @Body() body: SetChannelSettingBody): Promise<ChannelSettingResponse> {
    return this.templateService.setChannelSetting(params.templateId, params.channel, body.isEnabled);
  }
}
