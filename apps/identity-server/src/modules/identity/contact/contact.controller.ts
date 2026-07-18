/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Body, Delete, Get, HttpController, HttpStatus, Post, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SessionAuthService } from '@server/modules/auth/session';

import {
  AddContactResponse,
  AddEmailBody,
  AddPhoneBody,
  ContactItemDto,
  ContactListResponse,
  ContactOperationResponse,
  RemoveEmailBody,
  RemovePhoneBody,
  VerifyContactBody,
} from './contact.dto';
import { ContactItem, ContactService } from './contact.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/me')
export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly sessionAuthService: SessionAuthService,
  ) {}

  private toDto(item: ContactItem): ContactItemDto {
    return { value: item.value, isPrimary: item.isPrimary, verifiedAt: item.verifiedAt?.toISOString() };
  }

  @Get('/emails')
  @RespondFor(200, ContactListResponse)
  async listEmails(@Req() request: FastifyRequest): Promise<ContactListResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    return { items: (await this.contactService.listEmails(session.userId)).map(item => this.toDto(item)) };
  }

  @Post('/emails')
  @HttpStatus(200)
  @RespondFor(200, AddContactResponse)
  async addEmail(@Body() body: AddEmailBody, @Req() request: FastifyRequest): Promise<AddContactResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    return { verificationId: await this.contactService.addEmail(session.userId, body.email) };
  }

  @Post('/emails/verify')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async verifyEmail(@Body() body: VerifyContactBody, @Req() request: FastifyRequest): Promise<ContactOperationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.contactService.verifyEmail(session.userId, body.verificationId, body.code);
    return { success: true };
  }

  @Post('/emails/primary')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async setPrimaryEmail(@Body() body: AddEmailBody, @Req() request: FastifyRequest): Promise<ContactOperationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.contactService.setPrimaryEmail(session.userId, body.email);
    return { success: true };
  }

  @Delete('/emails')
  @RespondFor(200, ContactOperationResponse)
  async removeEmail(@Body() body: RemoveEmailBody, @Req() request: FastifyRequest): Promise<ContactOperationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.contactService.removeEmail(session.userId, body.email);
    return { success: true };
  }

  @Get('/phones')
  @RespondFor(200, ContactListResponse)
  async listPhones(@Req() request: FastifyRequest): Promise<ContactListResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    return { items: (await this.contactService.listPhones(session.userId)).map(item => this.toDto(item)) };
  }

  @Post('/phones')
  @HttpStatus(200)
  @RespondFor(200, AddContactResponse)
  async addPhone(@Body() body: AddPhoneBody, @Req() request: FastifyRequest): Promise<AddContactResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    return { verificationId: await this.contactService.addPhone(session.userId, body.phone) };
  }

  @Post('/phones/verify')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async verifyPhone(@Body() body: VerifyContactBody, @Req() request: FastifyRequest): Promise<ContactOperationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.contactService.verifyPhone(session.userId, body.verificationId, body.code);
    return { success: true };
  }

  @Post('/phones/primary')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async setPrimaryPhone(@Body() body: AddPhoneBody, @Req() request: FastifyRequest): Promise<ContactOperationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.contactService.setPrimaryPhone(session.userId, body.phone);
    return { success: true };
  }

  @Delete('/phones')
  @RespondFor(200, ContactOperationResponse)
  async removePhone(@Body() body: RemovePhoneBody, @Req() request: FastifyRequest): Promise<ContactOperationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.contactService.removePhone(session.userId, body.phone);
    return { success: true };
  }
}
