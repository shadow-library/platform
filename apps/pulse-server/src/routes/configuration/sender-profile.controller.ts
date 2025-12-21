/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SenderProfileService } from '@modules/configuration';
import { AppErrorCode } from '@server/classes';

import { CreateSenderProfileBody, ListSenderProfileResponse, ListSenderProfilesQuery, SenderProfileParams, SenderProfileResponse, UpdateSenderProfileBody } from './dtos';

/**
 * Declaring the constants
 */

@HttpController('/sender-profiles')
export class SenderProfileController {
  constructor(private readonly senderProfileService: SenderProfileService) {}

  @Post()
  @RespondFor(201, SenderProfileResponse)
  createSenderProfile(@Body() body: CreateSenderProfileBody): Promise<SenderProfileResponse> {
    return this.senderProfileService.createSenderProfile(body);
  }

  @Get()
  @RespondFor(200, ListSenderProfileResponse)
  listSenderProfiles(@Query() query: ListSenderProfilesQuery): Promise<ListSenderProfileResponse> {
    return this.senderProfileService.listSenderProfiles(query);
  }

  @Get('/:profileId')
  @RespondFor(200, SenderProfileResponse)
  async getSenderProfile(@Params() params: SenderProfileParams): Promise<SenderProfileResponse> {
    const senderProfile = await this.senderProfileService.getSenderProfile(params.profileId);
    if (!senderProfile) throw new ServerError(AppErrorCode.SND_PRF_001);
    return senderProfile;
  }

  @Patch('/:profileId')
  @RespondFor(200, SenderProfileResponse)
  updateSenderProfile(@Params() params: SenderProfileParams, @Body() body: UpdateSenderProfileBody): Promise<SenderProfileResponse> {
    return this.senderProfileService.updateSenderProfile(params.profileId, body);
  }

  @Delete('/:profileId')
  @HttpStatus(204)
  deleteSenderProfile(@Params() params: SenderProfileParams): Promise<void> {
    return this.senderProfileService.deleteSenderProfile(params.profileId);
  }
}
