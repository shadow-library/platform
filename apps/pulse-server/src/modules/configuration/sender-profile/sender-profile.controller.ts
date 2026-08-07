import { RequirePermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

import {
  CreateSenderProfileBody,
  ListSenderProfileResponse,
  ListSenderProfilesQuery,
  SenderProfileParams,
  SenderProfileResponse,
  UpdateSenderProfileBody,
} from './sender-profile.dto';
import { SenderProfileService } from './sender-profile.service';

@HttpController('/api/v1/sender-profiles')
export class SenderProfileController {
  constructor(private readonly senderProfileService: SenderProfileService) {}

  @Post()
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @RespondFor(201, SenderProfileResponse)
  createSenderProfile(@Body() body: CreateSenderProfileBody): Promise<SenderProfileResponse> {
    return this.senderProfileService.createSenderProfile(body);
  }

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.sendersRead)
  @RespondFor(200, ListSenderProfileResponse)
  listSenderProfiles(@Query() query: ListSenderProfilesQuery): Promise<ListSenderProfileResponse> {
    return this.senderProfileService.listSenderProfiles(query);
  }

  @Get('/:profileId')
  @RequirePermission(PULSE_PERMISSIONS.sendersRead)
  @RespondFor(200, SenderProfileResponse)
  async getSenderProfile(@Params() params: SenderProfileParams): Promise<SenderProfileResponse> {
    const senderProfile = await this.senderProfileService.getSenderProfile(params.profileId);
    if (!senderProfile) throw AppErrorCode.SND_PRF_001.create();
    return senderProfile;
  }

  @Patch('/:profileId')
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @RespondFor(200, SenderProfileResponse)
  updateSenderProfile(@Params() params: SenderProfileParams, @Body() body: UpdateSenderProfileBody): Promise<SenderProfileResponse> {
    return this.senderProfileService.updateSenderProfile(params.profileId, body);
  }

  @Delete('/:profileId')
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @HttpStatus(204)
  deleteSenderProfile(@Params() params: SenderProfileParams): Promise<void> {
    return this.senderProfileService.deleteSenderProfile(params.profileId);
  }
}
