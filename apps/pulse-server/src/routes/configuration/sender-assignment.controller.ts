/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SenderAssignmentService } from '@modules/configuration';
import { AppErrorCode } from '@server/classes';

import {
  CreateSenderAssignmentBody,
  ListSenderAssignmentResponse,
  ListSenderAssignmentsQuery,
  SenderAssignmentDetailResponse,
  SenderAssignmentParams,
  SenderAssignmentResponse,
  UpdateSenderAssignmentBody,
} from './dtos';

/**
 * Declaring the constants
 */

@HttpController('/sender-profile-assignments')
export class SenderAssignmentController {
  constructor(private readonly senderAssignmentService: SenderAssignmentService) {}

  @Post()
  @RespondFor(201, SenderAssignmentResponse)
  createSenderAssignment(@Body() body: CreateSenderAssignmentBody): Promise<SenderAssignmentResponse> {
    return this.senderAssignmentService.createSenderAssignment(body);
  }

  @Get()
  @RespondFor(200, ListSenderAssignmentResponse)
  listSenderAssignments(@Query() query: ListSenderAssignmentsQuery): Promise<ListSenderAssignmentResponse> {
    return this.senderAssignmentService.listSenderAssignments(query);
  }

  @Get('/:serviceName/:messageType/:region')
  @RespondFor(200, SenderAssignmentDetailResponse)
  async getSenderAssignment(@Params() params: SenderAssignmentParams): Promise<SenderAssignmentDetailResponse> {
    const senderAssignment = await this.senderAssignmentService.getSenderAssignment(params.serviceName, params.messageType, params.region);
    if (!senderAssignment) throw new ServerError(AppErrorCode.SND_ASGN_001);
    return senderAssignment;
  }

  @Patch('/:serviceName/:messageType/:region')
  @RespondFor(200, SenderAssignmentResponse)
  updateSenderAssignment(@Params() params: SenderAssignmentParams, @Body() body: UpdateSenderAssignmentBody): Promise<SenderAssignmentResponse> {
    return this.senderAssignmentService.updateSenderAssignment(params.serviceName, params.messageType, params.region, body.senderProfileId);
  }

  @Delete('/:serviceName/:messageType/:region')
  @HttpStatus(204)
  deleteSenderAssignment(@Params() params: SenderAssignmentParams): Promise<void> {
    return this.senderAssignmentService.deleteSenderAssignment(params.serviceName, params.messageType, params.region);
  }
}
