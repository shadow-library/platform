import { Body, Delete, Get, HttpController, HttpStatus, Post, Query, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';

import {
  MfaEnrollmentsResponse,
  OperationSuccessResponse,
  RecoveryCodesResponse,
  StepUpBody,
  StepUpIntentQuery,
  StepUpIntentResponse,
  StepUpMethodsResponse,
  StepUpResponse,
  TotpActivateResponse,
  TotpCodeBody,
  TotpEnrollResponse,
} from './mfa.dto';
import { MfaService } from './mfa.service';

@HttpController('/api/v1/me/mfa')
@Auth({ session: true })
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Get()
  @RespondFor(200, MfaEnrollmentsResponse)
  listMfaEnrollments(): ReturnType<MfaService['listEnrollmentSummary']> {
    return this.mfaService.listEnrollmentSummary(Context.getSession().userId);
  }

  @Post('/totp/enroll')
  @HttpStatus(200)
  @RespondFor(200, TotpEnrollResponse)
  enrollTotp(): ReturnType<MfaService['beginTotpEnrollment']> {
    return this.mfaService.beginTotpEnrollment(Context.getSession().userId, Context.getAuth().elevated ?? false);
  }

  @Post('/totp/activate')
  @HttpStatus(200)
  @RespondFor(200, TotpActivateResponse)
  activateTotp(@Body() body: TotpCodeBody): ReturnType<MfaService['completeTotpActivation']> {
    return this.mfaService.completeTotpActivation(Context.getSession(), body.code);
  }

  @Post('/recovery-codes')
  @Auth({ elevated: true })
  @HttpStatus(200)
  @RespondFor(200, RecoveryCodesResponse)
  regenerateRecoveryCodes(): ReturnType<MfaService['regenerateRecoveryCodes']> {
    return this.mfaService.regenerateRecoveryCodes(Context.getSession().userId);
  }

  @Delete('/totp')
  @Auth({ elevated: true })
  @RespondFor(200, OperationSuccessResponse)
  async disableTotp(): Promise<OperationSuccessResponse> {
    await this.mfaService.disableTotp(Context.getSession().userId);
    return { success: true };
  }

  @Get('/step-up/methods')
  @RespondFor(200, StepUpMethodsResponse)
  async stepUpMethods(): Promise<StepUpMethodsResponse> {
    return { methods: await this.mfaService.getStepUpMethods(Context.getSession().userId) };
  }

  @Get('/step-up/intent')
  @RespondFor(200, StepUpIntentResponse)
  resolveStepUpIntent(@Query() query: StepUpIntentQuery): ReturnType<MfaService['resolveStepUpIntent']> {
    return this.mfaService.resolveStepUpIntent(query.clientId);
  }

  @Post('/step-up')
  @HttpStatus(200)
  @RespondFor(200, StepUpResponse)
  stepUp(@Body() body: StepUpBody): ReturnType<MfaService['stepUp']> {
    return this.mfaService.stepUp(Context.getSession(), { code: body.code, password: body.password, clientId: body.clientId, resource: body.resource });
  }
}
