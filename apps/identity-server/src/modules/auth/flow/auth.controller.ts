/**
 * Importing npm packages
 */
import { Body, HttpController, HttpStatus, Post, Req, Res, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyReply, type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { DeviceContext } from './auth-flow.service';
import { ChallengeVerifyBody, ChallengeVerifyResponse, LoginInitBody, LoginInitResponse } from './auth.dto';
import { LoginService } from './login.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/auth')
export class AuthController {
  constructor(private readonly loginService: LoginService) {}

  @Post('/login/init')
  @RespondFor(200, LoginInitResponse)
  loginInit(@Body() body: LoginInitBody, @Req() request: FastifyRequest): Promise<LoginInitResponse> {
    return this.loginService.init({ identifier: body.identifier, device: this.deviceContext(request, body.deviceId) });
  }

  @Post('/challenge/verify')
  @HttpStatus(200)
  @RespondFor(200, ChallengeVerifyResponse)
  @RespondFor(401, ChallengeVerifyResponse)
  async challengeVerify(@Body() body: ChallengeVerifyBody, @Res() reply: FastifyReply): Promise<ChallengeVerifyResponse> {
    if (!body.password) throw new ServerError(AppErrorCode.AUTH_003);
    const result = await this.loginService.verifyPassword(body.flowId, body.password);
    if ('cookies' in result) {
      for (const cookie of result.cookies) reply.setCookie(cookie.name, cookie.value, cookie.options);
      return { flowId: result.flowId, status: 'COMPLETED' };
    }
    reply.status(401);
    return { flowId: result.flowId, status: result.status, attemptsLeft: result.attemptsLeft };
  }

  private deviceContext(request: FastifyRequest, deviceId?: string): DeviceContext {
    const userAgent = request.headers['user-agent'];
    return { fingerprint: deviceId, ipAddress: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined };
  }
}
