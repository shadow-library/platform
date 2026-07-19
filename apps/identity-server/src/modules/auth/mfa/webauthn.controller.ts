/**
 * Importing npm packages
 */
import { Body, Delete, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { OperationSuccessResponse } from './mfa.dto';
import { WebauthnRegisterResponse, WebauthnRegisterVerifyBody, WebauthnRegistrationOptionsResponse, WebauthnRemoveParams } from './webauthn.dto';
import { WebauthnService } from './webauthn.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/me/webauthn')
@Auth({ session: true })
export class WebauthnController {
  constructor(private readonly webauthnService: WebauthnService) {}

  @Post('/register/options')
  @HttpStatus(200)
  @RespondFor(200, WebauthnRegistrationOptionsResponse)
  getWebauthnRegistrationOptions(): ReturnType<WebauthnService['beginRegistration']> {
    return this.webauthnService.beginRegistration(Context.getSession().userId, Context.getAuth().elevated ?? false);
  }

  @Post('/register/verify')
  @HttpStatus(200)
  @RespondFor(200, WebauthnRegisterResponse)
  verifyWebauthnRegistration(@Body() body: WebauthnRegisterVerifyBody): ReturnType<WebauthnService['completeRegistration']> {
    return this.webauthnService.completeRegistration(Context.getSession(), Context.getAuth().elevated ?? false, body);
  }

  @Delete('/:credentialId')
  @Auth({ elevated: true })
  @RespondFor(200, OperationSuccessResponse)
  async removeWebauthnCredential(@Params() params: WebauthnRemoveParams): Promise<OperationSuccessResponse> {
    await this.webauthnService.removeCredential(Context.getSession().userId, params.credentialId);
    return { success: true };
  }
}
