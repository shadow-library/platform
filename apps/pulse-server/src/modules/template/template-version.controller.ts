import { RequirePermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

import {
  ContentParams,
  ContentResponse,
  PreviewBody,
  PreviewResponse,
  PublishVersionBody,
  UpsertContentBody,
  VersionDetailResponse,
  VersionListResponse,
  VersionParams,
  VersionResponse,
} from './template-version.dto';
import { TemplateVersionService } from './template-version.service';
import { TemplateParams } from './template.dto';

@HttpController('/api/v1/templates/:templateId/versions')
export class TemplateVersionController {
  constructor(private readonly versionService: TemplateVersionService) {}

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, VersionListResponse)
  async listVersions(@Params() params: TemplateParams): Promise<VersionListResponse> {
    const items = await this.versionService.listVersions(params.templateId);
    return { items };
  }

  @Post('/draft')
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @RespondFor(201, VersionResponse)
  openDraft(@Params() params: TemplateParams): Promise<VersionResponse> {
    return this.versionService.openDraft(params.templateId);
  }

  @Put('/draft/contents')
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @RespondFor(200, ContentResponse)
  upsertContent(@Params() params: TemplateParams, @Body() body: UpsertContentBody): Promise<ContentResponse> {
    return this.versionService.upsertContent(params.templateId, body);
  }

  @Delete('/draft/contents/:channel/:locale')
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @HttpStatus(204)
  deleteContent(@Params() params: ContentParams): Promise<void> {
    return this.versionService.deleteContent(params.templateId, params.channel, params.locale);
  }

  @Post('/draft/publish')
  @RequirePermission(PULSE_PERMISSIONS.templatesPublish)
  @RespondFor(200, VersionResponse)
  publishDraft(@Params() params: TemplateParams, @Body() body: PublishVersionBody): Promise<VersionResponse> {
    return this.versionService.publishDraft(params.templateId, { notes: body.notes });
  }

  @Post('/preview')
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, PreviewResponse)
  preview(@Params() params: TemplateParams, @Body() body: PreviewBody): Promise<PreviewResponse> {
    return this.versionService.preview(params.templateId, body);
  }

  @Get('/:version')
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, VersionDetailResponse)
  async getVersion(@Params() params: VersionParams): Promise<VersionDetailResponse> {
    const version = await this.versionService.getVersion(params.templateId, params.version);
    if (!version) throw AppErrorCode.TPL_VER_001.create();
    return version;
  }

  @Post('/:version/rollback')
  @RequirePermission(PULSE_PERMISSIONS.templatesPublish)
  @RespondFor(200, VersionResponse)
  rollback(@Params() params: VersionParams, @Body() body: PublishVersionBody): Promise<VersionResponse> {
    return this.versionService.rollback(params.templateId, params.version, { notes: body.notes });
  }
}
