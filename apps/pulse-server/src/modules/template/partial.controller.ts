import { RequirePermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Patch, Post, Put, RespondFor } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

import {
  CreatePartialBody,
  PartialDetailResponse,
  PartialListResponse,
  PartialParams,
  PartialResponse,
  PartialVersionResponse,
  PublishPartialBody,
  SavePartialDraftBody,
  UpdatePartialBody,
} from './partial.dto';
import { PartialService } from './partial.service';

@HttpController('/api/v1/partials')
export class PartialController {
  constructor(private readonly partialService: PartialService) {}

  @Post()
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(201, PartialResponse)
  createPartial(@Body() body: CreatePartialBody): Promise<PartialResponse> {
    return this.partialService.createPartial(body);
  }

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, PartialListResponse)
  async listPartials(): Promise<PartialListResponse> {
    const items = await this.partialService.listPartials();
    return { items };
  }

  @Get('/:partialId')
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, PartialDetailResponse)
  async getPartial(@Params() params: PartialParams): Promise<PartialDetailResponse> {
    const partial = await this.partialService.getPartial(params.partialId);
    if (!partial) throw AppErrorCode.TPL_PRT_001.create();
    return partial;
  }

  @Patch('/:partialId')
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(200, PartialResponse)
  updatePartial(@Params() params: PartialParams, @Body() body: UpdatePartialBody): Promise<PartialResponse> {
    return this.partialService.updatePartial(params.partialId, body);
  }

  @Put('/:partialId/draft')
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(200, PartialVersionResponse)
  saveDraft(@Params() params: PartialParams, @Body() body: SavePartialDraftBody): Promise<PartialVersionResponse> {
    return this.partialService.saveDraft(params.partialId, body);
  }

  @Post('/:partialId/publish')
  @RequirePermission(PULSE_PERMISSIONS.layoutsWrite)
  @RespondFor(200, PartialVersionResponse)
  publishPartial(@Params() params: PartialParams, @Body() body: PublishPartialBody): Promise<PartialVersionResponse> {
    return this.partialService.publishPartial(params.partialId, { notes: body.notes });
  }
}
