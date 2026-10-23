import { type FastifyReply } from 'fastify';
import { Config, Logger } from '@shadow-library/common';
import { Body, Get, HttpController, Post, Query, Res } from '@shadow-library/fastify';

import { APP_NAME } from '@server/constants';
import { Auth } from '@server/modules/access';
import { FederatedCallbackBody, FederatedCallbackQuery, FederationError, IdentityProviderService, UpstreamOidcService } from '@server/modules/auth/federation';

import { AuthFlowService, sanitizeReturnTo } from './auth-flow.service';
import { FederatedStepUpService } from './federated-step-up.service';
import { LoginService } from './login.service';

@HttpController()
export class FederatedController {
  private readonly logger = Logger.getLogger(APP_NAME, FederatedController.name);
  private readonly loginUrl = Config.get('oauth.login-url');
  private readonly issuer = Config.get('oauth.issuer');

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly identityProviderService: IdentityProviderService,
    private readonly upstreamOidcService: UpstreamOidcService,
    private readonly loginService: LoginService,
    private readonly federatedStepUpService: FederatedStepUpService,
  ) {}

  @Get('/api/v1/auth/federated/callback')
  @Auth({ public: true })
  handleFederatedCallback(@Query() query: FederatedCallbackQuery, @Res() reply: FastifyReply): Promise<void> {
    return this.processCallback(query.state, query.code, query.error, undefined, reply);
  }

  /** Apple's `response_mode=form_post` POSTs the callback as `application/x-www-form-urlencoded`, carrying the same fields as the GET redirect plus `user` on the first authorization only. */
  @Post('/api/v1/auth/federated/callback')
  @Auth({ public: true })
  handleFederatedCallbackFormPost(@Body() body: FederatedCallbackBody, @Res() reply: FastifyReply): Promise<void> {
    return this.processCallback(body.state, body.code, body.error, body.user, reply);
  }

  private async processCallback(
    state: string | undefined,
    code: string | undefined,
    upstreamError: string | undefined,
    appleUser: string | undefined,
    reply: FastifyReply,
  ): Promise<void> {
    const flow = state ? await this.authFlowService.get(state) : null;
    // Re-sanitized on use: a flow stored before a sanitizer fix may still hold a destination that is now refused.
    const returnTo = sanitizeReturnTo(flow?.returnTo, this.issuer);
    const fail = (reason: string): void => {
      this.logger.warn('federated callback failed', { reason });
      reply.status(302).redirect(this.loginRedirect({ error: 'federation_failed', returnTo }));
    };

    if (!flow || (flow.kind !== 'LOGIN' && flow.kind !== 'STEP_UP') || !flow.federated) return fail('unknown or non-federated flow');
    if (upstreamError || !code) return fail(`upstream error: ${upstreamError ?? 'missing code'}`);

    const provider = await this.identityProviderService.getById(flow.federated.identityProviderId);
    if (!provider || !provider.isActive) return fail('identity provider missing or disabled');

    try {
      const identity = await this.upstreamOidcService.exchangeAndVerify(provider, code, flow.federated.codeVerifier, flow.federated.nonce, appleUser);

      if (flow.kind === 'STEP_UP') {
        const elevated = await this.federatedStepUpService.complete(flow, identity);
        reply.status(302).redirect(this.loginRedirect({ flow_id: flow.flowId, status: 'STEP_UP_COMPLETE', aal: elevated.aal }));
        return;
      }

      const result = await this.loginService.continueFederated(flow.flowId, identity);

      if (result.outcome === 'COMPLETED') {
        for (const cookie of result.cookies) reply.setCookie(cookie.name, cookie.value, cookie.options);
        reply.status(302).redirect(returnTo ?? '/account');
        return;
      }
      if (result.outcome === 'CONTINUE') {
        reply.status(302).redirect(this.loginRedirect({ flow_id: result.flowId, status: result.status, returnTo }));
        return;
      }
      fail(`flow refused: ${result.status}`);
    } catch (error) {
      fail(error instanceof FederationError ? error.message : `unexpected: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private loginRedirect(params: Record<string, string | undefined>): string {
    const url = new URL(this.loginUrl);
    for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);
    return url.toString();
  }
}
