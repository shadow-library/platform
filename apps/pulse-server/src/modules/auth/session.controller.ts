/**
 * Importing packages with side effects
 */
import '@fastify/cookie';

/**
 * Importing npm packages
 */
import { AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { RelyingParty } from '@shadow-library/auth/rp';
import { Config, Logger } from '@shadow-library/common';
import { Get, HttpController, type HttpRequest, type HttpResponse, HttpStatus, Post, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { Public } from './public.decorator';
import { PULSE_AUDIENCE } from './rbac.constants';
import { LoginCallbackQuery, LoginQuery, SessionResponse } from './session.dto';

/**
 * Defining types
 */

interface LoginFlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

/**
 * Declaring the constants
 *
 * BINDING CONTRACT with pulse-web (already coded against it):
 *   GET  /api/auth/login?returnTo=<path>  -> 302 to the identity authorization endpoint (PKCE)
 *   GET  /api/auth/callback               -> RP code exchange, sets the session cookie, 302 to returnTo
 *   GET  /api/auth/session                -> 200 { userId, email?, name? } | 401 (never 200-null)
 *   POST /api/auth/logout                 -> 204, clears the session cookie
 *
 * The session cookie stores the identity-issued access token minted for this service's own
 * audience (`resource` is sent on the authorization request), so `GET /session` verifies it with
 * the same offline `AuthClient` path as bearer requests — no bespoke session signing or storage.
 * The in-flight login state (PKCE verifier, state, nonce, returnTo) travels in a short-lived
 * httpOnly cookie scoped to `/api/auth`.
 */
const FLOW_COOKIE = 'pulse_auth_flow';
const FLOW_COOKIE_PATH = '/api/auth';
const FLOW_TTL_SECONDS = 600;

const SESSION_COOKIE = 'pulse_session';

const RP_SCOPES = ['openid', 'profile', 'email'];

const encodeFlow = (flow: LoginFlowState): string => Buffer.from(JSON.stringify(flow)).toString('base64url');

const decodeFlow = (value: string | undefined): LoginFlowState | null => {
  if (!value) return null;
  try {
    const flow = JSON.parse(Buffer.from(value, 'base64url').toString()) as LoginFlowState;
    return typeof flow.state === 'string' && typeof flow.codeVerifier === 'string' ? flow : null;
  } catch {
    return null;
  }
};

/** Only same-origin application paths are honoured, so the login flow can never become an open redirect */
const sanitizeReturnTo = (returnTo: string | undefined): string => (returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');

const optionalClaim = (claims: Record<string, unknown>, name: string): string | undefined => (typeof claims[name] === 'string' ? claims[name] : undefined);

@HttpController('/api/auth')
export class SessionController {
  private readonly logger = Logger.getLogger(APP_NAME, SessionController.name);

  constructor(
    private readonly authClient: AuthClient,
    private readonly relyingParty: RelyingParty,
  ) {}

  private cookieFlags(): { httpOnly: true; sameSite: 'lax'; secure: boolean } {
    return { httpOnly: true, sameSite: 'lax', secure: Config.isProd() };
  }

  @Get('/login')
  @Public()
  async login(@Query() query: LoginQuery, @Res() response: HttpResponse): Promise<void> {
    const returnTo = sanitizeReturnTo(query.returnTo);
    /** Resolved audience, not the raw config — the raw value is unset whenever the code default applies, and without `resource` identity mints an unusable `shadow-identity`-audience token */
    const request = await this.relyingParty.createAuthorizationUrl({ scopes: RP_SCOPES, resource: Config.get('auth.audience') ?? PULSE_AUDIENCE });
    const flow: LoginFlowState = { state: request.state, nonce: request.nonce, codeVerifier: request.codeVerifier, returnTo };
    response.setCookie(FLOW_COOKIE, encodeFlow(flow), { ...this.cookieFlags(), path: FLOW_COOKIE_PATH, maxAge: FLOW_TTL_SECONDS });
    this.logger.debug('Login flow started', { returnTo });
    response.status(302).redirect(request.url);
  }

  @Get('/callback')
  @Public()
  async callback(@Query() query: LoginCallbackQuery, @Req() request: HttpRequest, @Res() response: HttpResponse): Promise<void> {
    const flow = decodeFlow(request.cookies[FLOW_COOKIE]);
    response.clearCookie(FLOW_COOKIE, { path: FLOW_COOKIE_PATH });
    if (!flow || flow.state !== query.state) throw AppErrorCode.SES_001.create();

    const tokens = await this.relyingParty.exchangeCode({ code: query.code, codeVerifier: flow.codeVerifier, nonce: flow.nonce });
    response.setCookie(SESSION_COOKIE, tokens.accessToken, { ...this.cookieFlags(), path: '/', maxAge: tokens.expiresIn });
    this.logger.debug('Login flow completed', { returnTo: flow.returnTo, sub: tokens.idTokenClaims?.sub });
    response.status(302).redirect(sanitizeReturnTo(flow.returnTo));
  }

  @Get('/session')
  @Public()
  @RespondFor(200, SessionResponse)
  async getSession(@Req() request: HttpRequest): Promise<SessionResponse> {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) throw AppErrorCode.SEC_001.create();

    const principal: AuthPrincipal = await this.authClient.verify(token).catch(() => AppErrorCode.SEC_001.throw());
    return { userId: principal.sub, email: optionalClaim(principal.claims, 'email'), name: optionalClaim(principal.claims, 'name') };
  }

  @Post('/logout')
  @Public()
  @HttpStatus(204)
  logout(@Res() response: HttpResponse): void {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.status(204).send();
  }
}
