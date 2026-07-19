/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import {
  AddContactResponse,
  AddEmailBody,
  AddPhoneBody,
  ContactListResponse,
  ContactOperationResponse,
  RemoveEmailBody,
  RemovePhoneBody,
  VerifyContactBody,
} from './contact.dto';
import { type ContactItem, ContactService } from './contact.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/me')
@Auth({ session: true })
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get('/emails')
  @RespondFor(200, ContactListResponse)
  async listEmails(): Promise<{ items: ContactItem[] }> {
    return { items: await this.contactService.listEmails(Context.getSession().userId) };
  }

  @Post('/emails')
  @HttpStatus(200)
  @RespondFor(200, AddContactResponse)
  async addEmail(@Body() body: AddEmailBody): Promise<AddContactResponse> {
    return { verificationId: await this.contactService.addEmail(Context.getSession().userId, body.email) };
  }

  @Post('/emails/verify')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async verifyEmail(@Body() body: VerifyContactBody): Promise<ContactOperationResponse> {
    await this.contactService.verifyEmail(Context.getSession().userId, body.verificationId, body.code);
    return { success: true };
  }

  @Post('/emails/primary')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async setPrimaryEmail(@Body() body: AddEmailBody): Promise<ContactOperationResponse> {
    await this.contactService.setPrimaryEmail(Context.getSession().userId, body.email);
    return { success: true };
  }

  @Delete('/emails')
  @RespondFor(200, ContactOperationResponse)
  async removeEmail(@Body() body: RemoveEmailBody): Promise<ContactOperationResponse> {
    await this.contactService.removeEmail(Context.getSession().userId, body.email);
    return { success: true };
  }

  @Get('/phones')
  @RespondFor(200, ContactListResponse)
  async listPhones(): Promise<{ items: ContactItem[] }> {
    return { items: await this.contactService.listPhones(Context.getSession().userId) };
  }

  @Post('/phones')
  @HttpStatus(200)
  @RespondFor(200, AddContactResponse)
  async addPhone(@Body() body: AddPhoneBody): Promise<AddContactResponse> {
    return { verificationId: await this.contactService.addPhone(Context.getSession().userId, body.phone) };
  }

  @Post('/phones/verify')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async verifyPhone(@Body() body: VerifyContactBody): Promise<ContactOperationResponse> {
    await this.contactService.verifyPhone(Context.getSession().userId, body.verificationId, body.code);
    return { success: true };
  }

  @Post('/phones/primary')
  @HttpStatus(200)
  @RespondFor(200, ContactOperationResponse)
  async setPrimaryPhone(@Body() body: AddPhoneBody): Promise<ContactOperationResponse> {
    await this.contactService.setPrimaryPhone(Context.getSession().userId, body.phone);
    return { success: true };
  }

  @Delete('/phones')
  @RespondFor(200, ContactOperationResponse)
  async removePhone(@Body() body: RemovePhoneBody): Promise<ContactOperationResponse> {
    await this.contactService.removePhone(Context.getSession().userId, body.phone);
    return { success: true };
  }
}
