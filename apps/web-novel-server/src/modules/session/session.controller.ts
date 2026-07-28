/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Get, HttpController, type HttpResponse, HttpStatus, Post, Query, Res, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
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
 * The controller owns only the cookie/redirect transport; the OIDC orchestration lives in the service.
 */

@HttpController('/api/auth')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('/login')
  async login(@Query() query: LoginQuery, @Res() response: HttpResponse): Promise<void> {
    const { cookie, authorizationUrl } = await this.sessionService.beginLogin(query.returnTo);
    response.setCookie(LOGIN_COOKIE_NAME, cookie, this.sessionService.getLoginCookieOptions());
    return response.status(302).redirect(authorizationUrl);
  }

  @Get('/callback')
  async callback(@Query() query: CallbackQuery, @Res() response: HttpResponse): Promise<void> {
    const { cookie, returnTo } = await this.sessionService.completeLogin(query);
    response.setCookie(SESSION_COOKIE_NAME, cookie, this.sessionService.getSessionCookieOptions());
    response.clearCookie(LOGIN_COOKIE_NAME, { path: '/' });
    return response.status(302).redirect(returnTo);
  }

  @Get('/session')
  @RespondFor(200, SessionResponse)
  session(): SessionResponse {
    const session = this.sessionService.authenticate();
    return { userId: session.userId, email: session.email, name: session.name };
  }

  @Post('/logout')
  @HttpStatus(204)
  logout(@Res() response: HttpResponse): void {
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }
}
