import { Body, Delete, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';

import { OperationSuccessResponse, StepUpResponse } from './mfa.dto';
import {
  WebauthnRegisterResponse,
  WebauthnRegisterVerifyBody,
  WebauthnRegistrationOptionsResponse,
  WebauthnRemoveParams,
  WebauthnStepUpBody,
  WebauthnStepUpOptionsResponse,
} from './webauthn.dto';
import { WebauthnService } from './webauthn.service';

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

  @Post('/step-up/options')
  @HttpStatus(200)
  @RespondFor(200, WebauthnStepUpOptionsResponse)
  async stepUpOptions(): Promise<WebauthnStepUpOptionsResponse> {
    return { options: await this.webauthnService.beginStepUp(Context.getSession()) };
  }

  @Post('/step-up')
  @HttpStatus(200)
  @RespondFor(200, StepUpResponse)
  stepUp(@Body() body: WebauthnStepUpBody): ReturnType<WebauthnService['completeStepUp']> {
    return this.webauthnService.completeStepUp(Context.getSession(), body, { clientId: body.clientId, resource: body.resource });
  }

  @Delete('/:credentialId')
  @Auth({ elevated: true })
  @RespondFor(200, OperationSuccessResponse)
  async removeWebauthnCredential(@Params() params: WebauthnRemoveParams): Promise<OperationSuccessResponse> {
    await this.webauthnService.removeCredential(Context.getSession().userId, params.credentialId);
    return { success: true };
  }
}
