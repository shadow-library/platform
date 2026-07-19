/**
 * Importing npm packages
 */

import { type FastifyReply } from 'fastify';
import { Body, Get, HttpController, HttpStatus, Post, Query, Res, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';
import { WebauthnChallengeResponse } from '@server/modules/auth/mfa';
import { clearSessionCookies, SessionService } from '@server/modules/auth/session';
import { BackChannelLogoutService, RefreshTokenService } from '@server/modules/auth/token';
import { AuditService } from '@server/modules/infrastructure/audit';
import { RateLimit } from '@server/modules/infrastructure/security';

import { AuthFlowService, DeviceContext } from './auth-flow.service';
import {
  CancelFlowBody,
  ChallengeChangeBody,
  ChallengeMethodsQuery,
  ChallengeMethodsResponse,
  ChallengeResendBody,
  ChallengeResendResponse,
  ChallengeVerifyBody,
  ChallengeVerifyResponse,
  DemographicsBody,
  FlowStatusResponse,
  LoginInitBody,
  LoginInitResponse,
  ProfileBody,
  RecoverInitBody,
  RegisterInitBody,
  ResetPasswordBody,
  SetPasswordBody,
  WebauthnOptionsBody,
} from './auth.dto';
import { ChallengeFlowService } from './challenge-flow.service';
import { FlowStepResult } from './flow.types';
import { LoginService } from './login.service';
import { RecoveryService } from './recovery.service';
import { RegistrationService } from './registration.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/auth')
export class AuthController {
  constructor(
    private readonly loginService: LoginService,
    private readonly registrationService: RegistrationService,
    private readonly recoveryService: RecoveryService,
    private readonly authFlowService: AuthFlowService,
    private readonly challengeFlowService: ChallengeFlowService,
    private readonly sessionService: SessionService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly backChannelLogoutService: BackChannelLogoutService,
    private readonly auditService: AuditService,
  ) {}

  @Post('/login/init')
  @Auth({ public: true })
  @RateLimit({ name: 'login-init', limit: 20, windowSeconds: 3600 })
  @RespondFor(200, LoginInitResponse)
  loginInit(@Body() body: LoginInitBody): Promise<LoginInitResponse> {
    return this.loginService.init({ identifier: body.identifier, device: this.deviceContext(body.deviceId), returnTo: body.returnTo });
  }

  @Post('/register/init')
  @Auth({ public: true })
  @RateLimit({ name: 'register-init', limit: 5, windowSeconds: 3600 })
  @RespondFor(200, FlowStatusResponse)
  registerInit(@Body() body: RegisterInitBody): Promise<FlowStatusResponse> {
    return this.registrationService.init({ email: body.email, device: this.deviceContext(body.deviceId) });
  }

  @Post('/register/demographics')
  @Auth({ public: true })
  @RespondFor(200, FlowStatusResponse)
  registerDemographics(@Body() body: DemographicsBody): Promise<FlowStatusResponse> {
    return this.registrationService.setDemographics(body.flowId, { dateOfBirth: body.dateOfBirth, gender: body.gender });
  }

  @Post('/register/profile')
  @Auth({ public: true })
  @RespondFor(200, FlowStatusResponse)
  registerProfile(@Body() body: ProfileBody): Promise<FlowStatusResponse> {
    return this.registrationService.setProfile(body.flowId, { firstName: body.firstName, lastName: body.lastName });
  }

  @Post('/register/password')
  @Auth({ public: true })
  @HttpStatus(200)
  @RespondFor(200, ChallengeVerifyResponse)
  async registerPassword(@Body() body: SetPasswordBody, @Res() reply: FastifyReply): Promise<ChallengeVerifyResponse> {
    const result = await this.registrationService.setPassword(body.flowId, body.password);
    return this.respond(result, reply);
  }

  @Post('/recover/init')
  @Auth({ public: true })
  @RateLimit({ name: 'recover-init', limit: 5, windowSeconds: 3600 })
  @RespondFor(200, FlowStatusResponse)
  recoverInit(@Body() body: RecoverInitBody): Promise<FlowStatusResponse> {
    return this.recoveryService.init({ identifier: body.identifier, device: this.deviceContext(body.deviceId) });
  }

  @Post('/recover/reset')
  @Auth({ public: true })
  @HttpStatus(200)
  @RespondFor(200, ChallengeVerifyResponse)
  async recoverReset(@Body() body: ResetPasswordBody, @Res() reply: FastifyReply): Promise<ChallengeVerifyResponse> {
    const result = await this.recoveryService.reset(body.flowId, body.newPassword);
    return this.respond(result, reply);
  }

  @Post('/challenge/verify')
  @Auth({ public: true })
  @HttpStatus(200)
  @RespondFor(200, ChallengeVerifyResponse)
  @RespondFor(401, ChallengeVerifyResponse)
  async challengeVerify(@Body() body: ChallengeVerifyBody, @Res() reply: FastifyReply): Promise<ChallengeVerifyResponse> {
    const result = await this.dispatchVerify(body);
    return this.respond(result, reply);
  }

  @Get('/challenge/methods')
  @Auth({ public: true })
  @RespondFor(200, ChallengeMethodsResponse)
  async challengeMethods(@Query() query: ChallengeMethodsQuery): Promise<ChallengeMethodsResponse> {
    const methods = await this.challengeFlowService.listMethods(query.flowId);
    return { flowId: query.flowId, methods };
  }

  @Post('/challenge/change')
  @Auth({ public: true })
  @HttpStatus(200)
  @RespondFor(200, FlowStatusResponse)
  challengeChange(@Body() body: ChallengeChangeBody): Promise<FlowStatusResponse> {
    return this.challengeFlowService.changeMethod(body.flowId, body.method);
  }

  @Post('/challenge/resend')
  @Auth({ public: true })
  @RateLimit({ name: 'challenge-resend', limit: 10, windowSeconds: 3600 })
  @HttpStatus(200)
  @RespondFor(200, ChallengeResendResponse)
  @RespondFor(429, ChallengeResendResponse)
  async challengeResend(@Body() body: ChallengeResendBody, @Res() reply: FastifyReply): Promise<ChallengeResendResponse> {
    const result = await this.challengeFlowService.resend(body.flowId, body.method);
    if (result.status === 'LIMITED') reply.status(429).header('retry-after', String(result.retryAfterSeconds));
    return result;
  }

  @Post('/cancel')
  @Auth({ public: true })
  async cancelFlow(@Body() body: CancelFlowBody, @Res() reply: FastifyReply): Promise<void> {
    await this.authFlowService.delete(body.flowId);
    reply.status(204).send();
  }

  /** Terminates the current session and its refresh-token families, then clears the session cookies. */
  @Post('/signout')
  @Auth({ session: true })
  async signout(@Res() reply: FastifyReply): Promise<void> {
    const session = Context.getSession();
    await this.sessionService.revoke(session.id, 'TERMINATED');
    await this.refreshTokenService.revokeForSession(session.id);
    await this.backChannelLogoutService.enqueueForSession(session.id, session.userId);
    await this.auditService.record({ action: 'auth.signout', outcome: 'SUCCESS', actorType: 'USER', actorId: session.userId.toString(), ipAddress: Context.getClientInfo().ip });
    for (const cookie of clearSessionCookies()) reply.setCookie(cookie.name, cookie.value, cookie.options);
    reply.status(204).send();
  }

  /** Issues passkey assertion options for a usernameless login or a flow's MFA step. */
  @Post('/webauthn/options')
  @Auth({ public: true })
  @RateLimit({ name: 'webauthn-options', limit: 60, windowSeconds: 3600 })
  @HttpStatus(200)
  @RespondFor(200, WebauthnChallengeResponse)
  webauthnOptions(@Body() body: WebauthnOptionsBody): Promise<WebauthnChallengeResponse> {
    return this.loginService.webauthnOptions(body.flowId, this.deviceContext(body.deviceId));
  }

  private async dispatchVerify(body: ChallengeVerifyBody): Promise<FlowStepResult> {
    if (body.password) return this.loginService.verifyPassword(body.flowId, body.password);
    if (!body.code && !body.recoveryCode && !body.webauthn) throw AppErrorCode.AUTH_003.create();

    const flow = await this.authFlowService.get(body.flowId);
    if (!flow) throw AppErrorCode.AUTH_001.create();

    if (body.webauthn) {
      if (flow.kind === 'LOGIN') return this.loginService.verifyWebauthn(body.flowId, body.webauthn);
      throw AppErrorCode.AUTH_002.create();
    }

    if (body.recoveryCode) {
      if (flow.kind === 'LOGIN') return this.loginService.verifyMfa(body.flowId, { recoveryCode: body.recoveryCode });
      if (flow.kind === 'RECOVERY') return this.recoveryService.verifyMfa(body.flowId, { recoveryCode: body.recoveryCode });
      throw AppErrorCode.AUTH_002.create();
    }

    const code = body.code as string;
    if (flow.kind === 'LOGIN')
      return flow.status === 'AWAITING_EMAIL_OTP' || flow.status === 'AWAITING_SMS_OTP' || flow.status === 'AWAITING_LINK_OTP'
        ? this.loginService.verifyOtp(body.flowId, code)
        : this.loginService.verifyMfa(body.flowId, { code });
    if (flow.kind === 'REGISTRATION') return this.registrationService.verifyOtp(body.flowId, code);
    if (flow.kind === 'RECOVERY')
      return flow.status === 'AWAITING_TOTP' ? this.recoveryService.verifyMfa(body.flowId, { code }) : this.recoveryService.verifyOtp(body.flowId, code);
    throw AppErrorCode.AUTH_002.create();
  }

  private respond(result: FlowStepResult, reply: FastifyReply): ChallengeVerifyResponse {
    if (result.outcome === 'COMPLETED') {
      for (const cookie of result.cookies) reply.setCookie(cookie.name, cookie.value, cookie.options);
      return { flowId: result.flowId, status: 'COMPLETED' };
    }
    if (result.outcome === 'FAILED') {
      reply.status(401);
      return { flowId: result.flowId, status: result.status, attemptsLeft: result.attemptsLeft };
    }
    return { flowId: result.flowId, status: result.status };
  }

  private deviceContext(deviceId?: string): DeviceContext {
    const { ip, userAgent } = Context.getClientInfo();
    return { fingerprint: deviceId, ipAddress: ip, userAgent };
  }
}
