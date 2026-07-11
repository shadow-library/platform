/**
 * Importing npm packages
 */
import { Body, HttpController, HttpStatus, Post, Req, Res, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyReply, type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { AuthFlowService, DeviceContext } from './auth-flow.service';
import {
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
} from './auth.dto';
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
  ) {}

  @Post('/login/init')
  @RespondFor(200, LoginInitResponse)
  loginInit(@Body() body: LoginInitBody, @Req() request: FastifyRequest): Promise<LoginInitResponse> {
    return this.loginService.init({ identifier: body.identifier, device: this.deviceContext(request, body.deviceId) });
  }

  @Post('/register/init')
  @RespondFor(200, FlowStatusResponse)
  registerInit(@Body() body: RegisterInitBody, @Req() request: FastifyRequest): Promise<FlowStatusResponse> {
    return this.registrationService.init({ email: body.email, device: this.deviceContext(request, body.deviceId) });
  }

  @Post('/register/demographics')
  @RespondFor(200, FlowStatusResponse)
  registerDemographics(@Body() body: DemographicsBody): Promise<FlowStatusResponse> {
    return this.registrationService.setDemographics(body.flowId, { dateOfBirth: body.dateOfBirth, gender: body.gender });
  }

  @Post('/register/profile')
  @RespondFor(200, FlowStatusResponse)
  registerProfile(@Body() body: ProfileBody): Promise<FlowStatusResponse> {
    return this.registrationService.setProfile(body.flowId, { firstName: body.firstName, lastName: body.lastName });
  }

  @Post('/register/password')
  @HttpStatus(200)
  @RespondFor(200, ChallengeVerifyResponse)
  async registerPassword(@Body() body: SetPasswordBody, @Res() reply: FastifyReply): Promise<ChallengeVerifyResponse> {
    const result = await this.registrationService.setPassword(body.flowId, body.password);
    return this.respond(result, reply);
  }

  @Post('/recover/init')
  @RespondFor(200, FlowStatusResponse)
  recoverInit(@Body() body: RecoverInitBody, @Req() request: FastifyRequest): Promise<FlowStatusResponse> {
    return this.recoveryService.init({ identifier: body.identifier, device: this.deviceContext(request, body.deviceId) });
  }

  @Post('/recover/reset')
  @HttpStatus(200)
  @RespondFor(200, ChallengeVerifyResponse)
  async recoverReset(@Body() body: ResetPasswordBody, @Res() reply: FastifyReply): Promise<ChallengeVerifyResponse> {
    const result = await this.recoveryService.reset(body.flowId, body.newPassword);
    return this.respond(result, reply);
  }

  @Post('/challenge/verify')
  @HttpStatus(200)
  @RespondFor(200, ChallengeVerifyResponse)
  @RespondFor(401, ChallengeVerifyResponse)
  async challengeVerify(@Body() body: ChallengeVerifyBody, @Res() reply: FastifyReply): Promise<ChallengeVerifyResponse> {
    const result = await this.dispatchVerify(body);
    return this.respond(result, reply);
  }

  private async dispatchVerify(body: ChallengeVerifyBody): Promise<FlowStepResult> {
    if (body.password) return this.loginService.verifyPassword(body.flowId, body.password);
    if (!body.code && !body.recoveryCode) throw new ServerError(AppErrorCode.AUTH_003);

    const flow = await this.authFlowService.get(body.flowId);
    if (!flow) throw new ServerError(AppErrorCode.AUTH_001);

    if (body.recoveryCode) {
      if (flow.kind === 'LOGIN') return this.loginService.verifyMfa(body.flowId, { recoveryCode: body.recoveryCode });
      if (flow.kind === 'RECOVERY') return this.recoveryService.verifyMfa(body.flowId, { recoveryCode: body.recoveryCode });
      throw new ServerError(AppErrorCode.AUTH_002);
    }

    const code = body.code as string;
    if (flow.kind === 'LOGIN') return this.loginService.verifyMfa(body.flowId, { code });
    if (flow.kind === 'REGISTRATION') return this.registrationService.verifyOtp(body.flowId, code);
    if (flow.kind === 'RECOVERY')
      return flow.status === 'AWAITING_TOTP' ? this.recoveryService.verifyMfa(body.flowId, { code }) : this.recoveryService.verifyOtp(body.flowId, code);
    throw new ServerError(AppErrorCode.AUTH_002);
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

  private deviceContext(request: FastifyRequest, deviceId?: string): DeviceContext {
    const userAgent = request.headers['user-agent'];
    return { fingerprint: deviceId, ipAddress: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined };
  }
}
