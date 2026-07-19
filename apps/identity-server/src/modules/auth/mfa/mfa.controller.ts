/**
 * Importing npm packages
 */

import { Body, Delete, Get, HttpController, HttpStatus, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { MfaEnrollmentsResponse, OperationSuccessResponse, RecoveryCodesResponse, StepUpResponse, TotpActivateResponse, TotpCodeBody, TotpEnrollResponse } from './mfa.dto';
import { MfaService } from './mfa.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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

  @Post('/step-up')
  @HttpStatus(200)
  @RespondFor(200, StepUpResponse)
  stepUp(@Body() body: TotpCodeBody): ReturnType<MfaService['stepUp']> {
    return this.mfaService.stepUp(Context.getSession(), body.code);
  }
}
