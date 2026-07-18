/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type FastifyReply } from 'fastify';
import { RelyingParty } from '@shadow-library/auth/rp';
import { Config } from '@shadow-library/common';
import { Get, HttpController, type HttpRequest, HttpStatus, Post, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { NOVEL_FORGE_AUDIENCE } from '@server/constants';

import { CallbackQuery, LoginQuery, SessionResponse } from './auth.dto';
import { LOGIN_FLOW_COOKIE, SESSION_COOKIE, SessionService, type SessionUser } from './session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The first-party session surface. Deliberately versionless (`/api/auth/*`, not `/api/v1/*`) and
 * deliberately unguarded: login/callback run before an identity exists, and `/session` reports
 * 401 itself so the web app can probe it without tripping the bearer guard.
 */

@HttpController('/api/auth')
export class AuthController {
  constructor(
    private readonly relyingParty: RelyingParty,
    private readonly sessionService: SessionService,
  ) {}

  /** Starts the OIDC code flow: PKCE + state + nonce go into a short-lived sealed cookie */
  @Get('/login')
  async login(@Query() query: LoginQuery, @Res() response: FastifyReply): Promise<void> {
    const returnTo = this.sessionService.normalizeReturnTo(query.returnTo);
    /** Resolved audience, not the raw config — without `resource` identity mints a `shadow-identity`-audience token this server's own guard rejects */
    const authorization = await this.relyingParty.createAuthorizationUrl({ resource: Config.get('auth.audience') ?? NOVEL_FORGE_AUDIENCE });
    const flow = this.sessionService.createLoginFlowCookie({ state: authorization.state, nonce: authorization.nonce, codeVerifier: authorization.codeVerifier, returnTo });
    await response.setCookie(LOGIN_FLOW_COOKIE, flow.value, flow.options).redirect(authorization.url, 302);
  }

  /**
   * Completes the code flow: exchanges the code, seals the session cookie, and returns to returnTo.
   * Cookies are read off the raw request — `HttpCoreModule` already registers `@fastify/cookie`
   * globally, and the `@Cookie()` decorator would try to register it a second time.
   */
  @Get('/callback')
  async callback(@Query() query: CallbackQuery, @Req() request: HttpRequest, @Res() response: FastifyReply): Promise<void> {
    const flow = this.sessionService.openLoginFlow(request.cookies[LOGIN_FLOW_COOKIE]);
    if (query.error || !query.code || query.state !== flow.state) throw AppErrorCode.SES_002.create();

    const tokens = await this.relyingParty.exchangeCode({ code: query.code, codeVerifier: flow.codeVerifier, nonce: flow.nonce });
    const session = this.sessionService.createSessionCookie(tokens);
    await response
      .setCookie(SESSION_COOKIE, session.value, session.options)
      .clearCookie(LOGIN_FLOW_COOKIE, this.sessionService.clearedCookieOptions())
      .redirect(flow.returnTo, 302);
  }

  /** The BINDING flat session contract: 200 `{ userId, email?, name? }` or 401 — never a 200 null */
  @Get('/session')
  @RespondFor(200, SessionResponse)
  getSession(@Req() request: HttpRequest): Promise<SessionUser> {
    return this.sessionService.resolveSession(request.cookies[SESSION_COOKIE]);
  }

  @Post('/logout')
  @HttpStatus(204)
  async logout(@Res() response: FastifyReply): Promise<void> {
    await response.clearCookie(SESSION_COOKIE, this.sessionService.clearedCookieOptions()).status(204).send();
  }
}
