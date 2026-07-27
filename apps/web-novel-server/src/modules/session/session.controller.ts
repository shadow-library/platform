/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { RelyingParty } from '@shadow-library/auth/rp';
import { Logger } from '@shadow-library/common';
import { Get, HttpController, type HttpResponse, HttpStatus, Post, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { LOGIN_COOKIE_NAME, SESSION_COOKIE_NAME } from './session.constants';
import { CallbackQuery, LoginQuery, SessionResponse } from './session.dto';
import { SessionService } from './session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The identity-based session surface webnovel-web is coded against. Login redirects through the
 * identity OIDC authorize endpoint (PKCE + state + nonce held in a signed, short-lived cookie);
 * the callback exchanges the code, validates the ID token, and mints the stateless session cookie.
 */

@HttpController('/api/auth')
export class SessionController {
  private readonly logger = Logger.getLogger(APP_NAME, SessionController.name);

  constructor(
    private readonly relyingParty: RelyingParty,
    private readonly sessionService: SessionService,
  ) {}

  @Get('/login')
  async login(@Query() query: LoginQuery, @Res() response: HttpResponse): Promise<void> {
    const returnTo = this.sanitizeReturnTo(query.returnTo);
    const authorization = await this.relyingParty.createAuthorizationUrl();
    const cookie = this.sessionService.createLoginCookie({ state: authorization.state, nonce: authorization.nonce, codeVerifier: authorization.codeVerifier, returnTo });
    response.setCookie(LOGIN_COOKIE_NAME, cookie, this.sessionService.getLoginCookieOptions());
    return response.status(302).redirect(authorization.url);
  }

  @Get('/callback')
  async callback(@Query() query: CallbackQuery, @Req() request: FastifyRequest, @Res() response: HttpResponse): Promise<void> {
    const transaction = this.sessionService.parseLoginTransaction(request) ?? AppErrorCode.WBN_005.throw();
    if (query.error) this.logger.warn('identity answered the authorization request with an error', { error: query.error });
    if (query.error || !query.code || !query.state || query.state !== transaction.state) throw AppErrorCode.WBN_005.create();

    const tokens = await this.relyingParty.exchangeCode({ code: query.code, codeVerifier: transaction.codeVerifier, nonce: transaction.nonce });
    const claims = tokens.idTokenClaims ?? AppErrorCode.WBN_005.throw();
    const userId = typeof claims.sub === 'string' && claims.sub ? claims.sub : AppErrorCode.WBN_005.throw();
    const email = typeof claims.email === 'string' ? claims.email : undefined;
    const name = typeof claims.name === 'string' ? claims.name : undefined;

    const cookie = this.sessionService.createSessionCookie({ userId, email, name });
    response.setCookie(SESSION_COOKIE_NAME, cookie, this.sessionService.getSessionCookieOptions());
    response.clearCookie(LOGIN_COOKIE_NAME, { path: '/' });
    this.logger.info('reader session established', { userId });
    return response.status(302).redirect(transaction.returnTo);
  }

  @Get('/session')
  @RespondFor(200, SessionResponse)
  session(@Req() request: FastifyRequest): SessionResponse {
    const session = this.sessionService.authenticate(request);
    return { userId: session.userId, email: session.email, name: session.name };
  }

  @Post('/logout')
  @HttpStatus(204)
  logout(@Res() response: HttpResponse): void {
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }

  /** Only same-origin absolute paths survive; anything else falls back to the root (open-redirect guard) */
  private sanitizeReturnTo(returnTo?: string): string {
    if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return '/';
    return returnTo;
  }
}
