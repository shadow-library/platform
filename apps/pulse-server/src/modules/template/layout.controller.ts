import { RequirePermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Patch, Post, Put, RespondFor } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

import {
  CreateLayoutBody,
  LayoutDetailResponse,
  LayoutListResponse,
  LayoutParams,
  LayoutResponse,
  LayoutVersionResponse,
  PublishLayoutBody,
  SaveLayoutDraftBody,
  UpdateLayoutBody,
} from './layout.dto';
import { LayoutService } from './layout.service';

@HttpController('/api/v1/layouts')
export class LayoutController {
  constructor(private readonly layoutService: LayoutService) {}

  @Post()
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(201, LayoutResponse)
  createLayout(@Body() body: CreateLayoutBody): Promise<LayoutResponse> {
    return this.layoutService.createLayout(body);
  }

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, LayoutListResponse)
  async listLayouts(): Promise<LayoutListResponse> {
    const items = await this.layoutService.listLayouts();
    return { items };
  }

  @Get('/:layoutId')
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, LayoutDetailResponse)
  async getLayout(@Params() params: LayoutParams): Promise<LayoutDetailResponse> {
    const layout = await this.layoutService.getLayout(params.layoutId);
    if (!layout) throw AppErrorCode.TPL_LYT_001.create();
    return layout;
  }

  @Patch('/:layoutId')
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(200, LayoutResponse)
  updateLayout(@Params() params: LayoutParams, @Body() body: UpdateLayoutBody): Promise<LayoutResponse> {
    return this.layoutService.updateLayout(params.layoutId, body);
  }

  @Put('/:layoutId/draft')
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(200, LayoutVersionResponse)
  saveDraft(@Params() params: LayoutParams, @Body() body: SaveLayoutDraftBody): Promise<LayoutVersionResponse> {
    return this.layoutService.saveDraft(params.layoutId, body);
  }

  @Post('/:layoutId/publish')
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(200, LayoutVersionResponse)
  publishLayout(@Params() params: LayoutParams, @Body() body: PublishLayoutBody): Promise<LayoutVersionResponse> {
    return this.layoutService.publishLayout(params.layoutId, { notes: body.notes });
  }
}
