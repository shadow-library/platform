/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Post, Req, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionAuthService, SessionService } from '@server/modules/auth/session';

import { MfaEnrollmentsResponse, OperationSuccessResponse, StepUpResponse, TotpCodeBody, TotpEnrollResponse } from './mfa.dto';
import { MfaService } from './mfa.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/me/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly sessionAuthService: SessionAuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Get()
  @RespondFor(200, MfaEnrollmentsResponse)
  async list(@Req() request: FastifyRequest): Promise<MfaEnrollmentsResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const enrollments = await this.mfaService.listEnrollments(session.userId);
    return { enrollments: enrollments.map(enrollment => ({ ...enrollment, createdAt: enrollment.createdAt.toISOString(), lastUsedAt: enrollment.lastUsedAt?.toISOString() })) };
  }

  /**
   * Provisioning the first factor requires only a session (the user cannot step up without any
   * factor yet); once MFA exists, changing factors demands a fresh second-factor proof.
   */
  @Post('/totp/enroll')
  @HttpStatus(200)
  @RespondFor(200, TotpEnrollResponse)
  async enrollTotp(@Req() request: FastifyRequest): Promise<TotpEnrollResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    if ((await this.mfaService.hasMfa(session.userId)) && !this.sessionService.isElevated(session)) throw new ServerError(AppErrorCode.AUTH_006);
    return this.mfaService.enrollTotp(session.userId);
  }

  @Post('/totp/activate')
  @HttpStatus(200)
  @RespondFor(200, OperationSuccessResponse)
  async activateTotp(@Body() body: TotpCodeBody, @Req() request: FastifyRequest): Promise<OperationSuccessResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.mfaService.activateTotp(session.userId, body.code);
    await this.sessionService.elevate(session.id);
    return { success: true };
  }

  @Delete('/totp')
  @RespondFor(200, OperationSuccessResponse)
  async disableTotp(@Req() request: FastifyRequest): Promise<OperationSuccessResponse> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    await this.mfaService.disableTotp(session.userId);
    return { success: true };
  }

  /** Elevates an existing session to AAL2 for the step-up window by proving a TOTP code. */
  @Post('/step-up')
  @HttpStatus(200)
  @RespondFor(200, StepUpResponse)
  async stepUp(@Body() body: TotpCodeBody, @Req() request: FastifyRequest): Promise<StepUpResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const valid = await this.mfaService.verifyTotp(session.userId, body.code);
    if (!valid) throw new ServerError(AppErrorCode.MFA_002);

    const elevated = await this.sessionService.elevate(session.id);
    if (!elevated || !elevated.elevatedUntil) throw new ServerError(AppErrorCode.AUTH_005);
    return { aal: elevated.aal, elevatedUntil: new Date(elevated.elevatedUntil).toISOString() };
  }
}
