/**
 * Importing npm packages
 */
import { type FastifyReply } from 'fastify';
import { Config, Logger } from '@shadow-library/common';
import { Get, HttpController, Query, Res } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { FederatedCallbackQuery, FederationError, IdentityProviderService, UpstreamOidcService } from '@server/modules/auth/federation';

import { AuthFlowService } from './auth-flow.service';
import { LoginService } from './login.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The browser return leg of inbound federation (T-702). Every failure funnels into one neutral
 * error redirect: the upstream's error detail is logged server-side but never shown — an attacker
 * driving this endpoint learns nothing about accounts, providers, or the reason for a refusal.
 */

@HttpController()
export class FederatedController {
  private readonly logger = Logger.getLogger(APP_NAME, FederatedController.name);
  private readonly loginUrl = Config.get('oauth.login-url');

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly identityProviderService: IdentityProviderService,
    private readonly upstreamOidcService: UpstreamOidcService,
    private readonly loginService: LoginService,
  ) {}

  @Get('/api/v1/auth/federated/callback')
  async callback(@Query() query: FederatedCallbackQuery, @Res() reply: FastifyReply): Promise<void> {
    const fail = (reason: string): void => {
      this.logger.warn('federated callback failed', { reason });
      reply.status(302).redirect(`${this.loginUrl}?error=federation_failed`);
    };

    const flow = query.state ? await this.authFlowService.get(query.state) : null;
    if (!flow || flow.kind !== 'LOGIN' || !flow.federated) return fail('unknown or non-federated flow');
    if (query.error || !query.code) return fail(`upstream error: ${query.error ?? 'missing code'}`);

    const provider = await this.identityProviderService.getById(flow.federated.identityProviderId);
    if (!provider || !provider.isActive) return fail('identity provider missing or disabled');

    try {
      const identity = await this.upstreamOidcService.exchangeAndVerify(provider, query.code, flow.federated.codeVerifier, flow.federated.nonce);
      const result = await this.loginService.continueFederated(flow.flowId, identity);

      if (result.outcome === 'COMPLETED') {
        for (const cookie of result.cookies) reply.setCookie(cookie.name, cookie.value, cookie.options);
        reply.status(302).redirect(flow.returnTo ?? '/account');
        return;
      }
      if (result.outcome === 'CONTINUE') {
        reply.status(302).redirect(`${this.loginUrl}?flow_id=${encodeURIComponent(result.flowId)}&status=${encodeURIComponent(result.status)}`);
        return;
      }
      fail(`flow refused: ${result.status}`);
    } catch (error) {
      fail(error instanceof FederationError ? error.message : `unexpected: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
