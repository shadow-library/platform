import { Body, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';
import { RateLimit } from '@server/modules/infrastructure/security';

import { AuthFlowService, DeviceContext } from './auth-flow.service';
import { AuthMethodsResponse, FlowIdParams, SocialLoginStartBody, SocialLoginStartResponse, SocialProviderParams } from './auth-methods.dto';
import { FlowStatusResponse } from './auth.dto';
import { SocialLoginService } from './social-login.service';

@HttpController('/api/v1/auth')
export class AuthMethodsController {
  constructor(
    private readonly socialLoginService: SocialLoginService,
    private readonly authFlowService: AuthFlowService,
  ) {}

  private deviceContext(deviceId?: string): DeviceContext {
    const { ip, userAgent } = Context.getClientInfo();
    return { fingerprint: deviceId, ipAddress: ip, userAgent };
  }

  @Get('/methods')
  @Auth({ public: true })
  @RespondFor(200, AuthMethodsResponse)
  listAuthMethods(): Promise<AuthMethodsResponse> {
    return this.socialLoginService.listAvailableMethods();
  }

  @Post('/social/:provider/start')
  @Auth({ public: true })
  @RateLimit({ name: 'social-login-start', limit: 20, windowSeconds: 3600 })
  @HttpStatus(200)
  @RespondFor(200, SocialLoginStartResponse)
  startSocialLogin(@Params() params: SocialProviderParams, @Body() body: SocialLoginStartBody): Promise<SocialLoginStartResponse> {
    return this.socialLoginService.start({ provider: params.provider, device: this.deviceContext(body.deviceId), returnTo: body.returnTo });
  }

  /**
   * Lets the hosted login page pick a flow back up after the browser has been away at an upstream
   * provider — the federated callback returns control by redirecting with the flow id, not by
   * answering the request that started it.
   */
  @Get('/flow/:flowId')
  @Auth({ public: true })
  @RespondFor(200, FlowStatusResponse)
  async getFlow(@Params() params: FlowIdParams): Promise<FlowStatusResponse> {
    const flow = await this.authFlowService.get(params.flowId);
    if (!flow) throw AppErrorCode.AUTH_001.create();
    return { flowId: flow.flowId, status: flow.status, resendsLeft: flow.resendsLeft };
  }
}
