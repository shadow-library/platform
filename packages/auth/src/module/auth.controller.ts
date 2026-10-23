import { Controller, EnableIf, Handler } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { Body, ContextService, Get, HttpController, type HttpResponse, Post, Query, RespondFor } from '@shadow-library/fastify';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { isThrottled, retryAfterHint } from '../lib/transport';
import { AuthAccessPolicy } from './access-policy';
import { AppSessionService } from './app-session.service';
import {
  AuthAccessResponse,
  AuthCallbackQuery,
  AuthLoginQuery,
  AuthLogoutResponse,
  AuthOrganisationsResponse,
  AuthSessionResponse,
  AuthStepUpQuery,
  AuthUserInfoResponse,
  BackchannelLogoutBody,
  BackchannelLogoutResponse,
  SwitchOrganisationBody,
  SwitchOrganisationResponse,
} from './auth.dto';
import { AuthRoutePaths } from './config';
import { parseCookies } from './cookie';
import { Public } from './decorators';
import { AuthGuardErrorCode } from './errors';

type RouteName = keyof Omit<AuthRoutePaths, 'basePath'>;

// Module-scoped mutable state: route metadata is settled at class-definition time, before a provider could be injected, so `AuthModule.forRoot()` stamps paths and
// enablement here before the scan.
// Every route is `@Public()` because guarding the sign-in surface in a `private` app would leave nobody able to sign in; routes needing a session check themselves and
// answer a plain 401.
// Cookies are read off the raw request, not `@Cookie()`, which pulls in the optional `@fastify/cookie` peer.
const ROUTE_HANDLERS: [RouteName, string][] = [
  ['login', 'login'],
  ['callback', 'callback'],
  ['logout', 'logout'],
  ['backchannelLogout', 'backchannelLogout'],
  ['session', 'session'],
  ['userinfo', 'userinfo'],
  ['stepUp', 'stepUp'],
  ['organisations', 'organisations'],
  ['organisation', 'switchOrganisation'],
  ['access', 'access'],
];

let routes: AuthRoutePaths | null = null;

const isEnabled = (route: RouteName): boolean => Boolean(routes?.[route]);

const FOUND = 302;

/** RFC 6749 §4.1.2.1: the two callback errors that report identity's own trouble rather than a refusal of this request */
const TRANSIENT_AUTHORIZATION_ERRORS = new Set(['server_error', 'temporarily_unavailable']);

// Must run before the module registry scans the class
export function configureAuthRoutes(resolved: AuthRoutePaths): void {
  routes = resolved;
  Controller({ path: resolved.basePath })(AuthController);

  for (const [route, handler] of ROUTE_HANDLERS) {
    const path = resolved[route];
    const descriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, handler);
    if (path && descriptor) Handler({ path })(AuthController.prototype, handler, descriptor);
  }
}

@Public()
@HttpController('/auth')
export class AuthController {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthController.name);

  constructor(
    private readonly sessions: AppSessionService,
    private readonly context: ContextService,
    private readonly accessPolicy: AuthAccessPolicy,
  ) {}

  @Get('/access')
  @EnableIf(() => isEnabled('access'))
  @RespondFor(200, AuthAccessResponse)
  access(): AuthAccessResponse {
    return { mode: this.accessPolicy.mode };
  }

  @Get('/login')
  @EnableIf(() => isEnabled('login'))
  async login(@Query() query: AuthLoginQuery): Promise<void> {
    const response = this.context.getResponse();
    const redirect = await this.sessions.beginLogin(query.return_to, this.requestOrigin());
    this.send(response, redirect.cookies, redirect.url);
  }

  @Get('/callback')
  @EnableIf(() => isEnabled('callback'))
  async callback(@Query() query: AuthCallbackQuery): Promise<void> {
    if (query.error) throw this.authorizationRefused(query.error);

    const result = await this.sessions.completeLogin(query, this.cookies(), this.requestOrigin()).catch((error: unknown) => this.rethrowWithRetryAfter(error));
    this.send(this.context.getResponse(), result.cookies, result.returnTo);
  }

  /** The logout URL is returned, not 302'd: this is a `fetch` POST, which cannot hand the user to a cross-origin redirect (`redirect: 'manual'` yields an opaque response) */
  @Post('/logout')
  @EnableIf(() => isEnabled('logout'))
  @RespondFor(200, AuthLogoutResponse)
  async logout(): Promise<AuthLogoutResponse> {
    const cleared = await this.sessions.logout(this.sessions.readHandle(this.cookies()));
    const redirectTo = await this.sessions.endSessionUrl();
    this.send(this.context.getResponse(), cleared);
    return redirectTo ? { success: true, redirectTo } : { success: true };
  }

  /** Answers 200 even when nothing matched: the notice is about the identity session, which this application may never have had */
  @Post('/backchannel-logout')
  @EnableIf(() => isEnabled('backchannelLogout'))
  @RespondFor(200, BackchannelLogoutResponse)
  async backchannelLogout(@Body() body: BackchannelLogoutBody): Promise<BackchannelLogoutResponse> {
    await this.sessions.handleBackchannelLogout(body.logout_token);
    return { success: true };
  }

  @Get('/session')
  @EnableIf(() => isEnabled('session'))
  @RespondFor(200, AuthSessionResponse)
  async session(): Promise<AuthSessionResponse> {
    const handle = this.sessions.readHandle(this.cookies());
    if (!handle) throw AuthGuardErrorCode.IAM_001.create();

    const principal = await this.sessions.resolvePrincipal(handle);
    return { sub: principal.sub, scopes: principal.scopes, org: principal.org, aal: principal.aal, clientId: principal.clientId };
  }

  /** Separate from `/session`, which gates rendering: a profile outage must not read as a logout */
  @Get('/userinfo')
  @EnableIf(() => isEnabled('userinfo'))
  @RespondFor(200, AuthUserInfoResponse)
  async userinfo(): Promise<AuthUserInfoResponse> {
    const handle = this.sessions.readHandle(this.cookies());
    if (!handle) throw AuthGuardErrorCode.IAM_001.create();

    return this.sessions.getUserInfo(handle);
  }

  @Get('/organisations')
  @EnableIf(() => isEnabled('organisations'))
  @RespondFor(200, AuthOrganisationsResponse)
  async organisations(): Promise<AuthOrganisationsResponse> {
    const handle = this.sessions.readHandle(this.cookies());
    if (!handle) throw AuthGuardErrorCode.IAM_001.create();

    return { organisations: await this.sessions.listOrganisations(handle) };
  }

  /** Identity rotates the handle, so the response carries a replacement cookie; a client keeping the old one is logged out */
  @Post('/organisation')
  @EnableIf(() => isEnabled('organisation'))
  @RespondFor(200, SwitchOrganisationResponse)
  async switchOrganisation(@Body() body: SwitchOrganisationBody): Promise<SwitchOrganisationResponse> {
    const handle = this.sessions.readHandle(this.cookies());
    if (!handle) throw AuthGuardErrorCode.IAM_001.create();

    const switched = await this.sessions.switchOrganisation(handle, body.organisationId);
    this.send(this.context.getResponse(), switched.cookies);
    return { organisationId: switched.organisationId };
  }

  /**
   * Claims an existing step-up first (the user may have satisfied identity elsewhere) and prompts only when there is none.
   * `claimed` marks a prompt already answered with nothing to claim, which is terminal;
   * `retried` marks a step-up that named another beneficiary, which only one fresh prompt can fix.
   */
  @Get('/step-up')
  @EnableIf(() => isEnabled('stepUp'))
  async stepUp(@Query() query: AuthStepUpQuery): Promise<void> {
    const handle = this.sessions.readHandle(this.cookies());
    if (!handle) throw AuthGuardErrorCode.IAM_001.create();

    const returnTo = this.sessions.resolveReturnTo(query.return_to);
    const outcome = await this.claim(handle, query);
    const target = outcome === 'claimed' ? returnTo : await this.promptUrl(returnTo, outcome, query);
    this.send(this.context.getResponse(), [], target);
  }

  private async claim(handle: string, query: AuthStepUpQuery): Promise<'claimed' | 'absent' | 'mismatch'> {
    return this.sessions
      .claimElevation(handle)
      .then((): 'claimed' => 'claimed')
      .catch((error: unknown) => {
        if (isThrottled(error)) this.rethrowWithRetryAfter(error);
        if (AppError.is(error, AuthErrorCode.ELEVATION_INTENT_MISMATCH)) {
          if (query.retried) throw error;
          this.logger.warn('the step-up named another beneficiary; restarting the prompt with this application intent');
          return 'mismatch';
        }
        if (query.claimed) throw error;
        this.logger.debug('no step-up left to claim; handing the browser to identity');
        return 'absent';
      });
  }

  private promptUrl(returnTo: string, outcome: 'absent' | 'mismatch', query: AuthStepUpQuery): Promise<string> {
    const markers = [outcome === 'absent' || query.claimed ? 'claimed=1' : '', outcome === 'mismatch' || query.retried ? 'retried=1' : ''].filter(Boolean);
    return this.sessions.identityStepUpUrl(`${this.sessions.stepUpUrl(returnTo)}&${markers.join('&')}`);
  }

  /** Anyone can hand the browser a callback URL, so `error_description` is never echoed and the status follows the RFC error alone */
  private authorizationRefused(error: string): AppError {
    this.logger.warn('identity answered the callback with an error', { error });
    if (error === 'access_denied') return AuthErrorCode.AUTHORIZATION_DENIED.create();
    if (TRANSIENT_AUTHORIZATION_ERRORS.has(error)) return AuthErrorCode.EXCHANGE_FAILED.create({ reason: 'identity could not complete the authorization' });
    return AuthErrorCode.AUTHORIZATION_REFUSED.create();
  }

  /** A throttle carries identity's hint forward, as the guard does, so the browser is told when to come back rather than sent round again */
  private rethrowWithRetryAfter(error: unknown): never {
    const retryAfterSeconds = retryAfterHint(error);
    if (isThrottled(error) && retryAfterSeconds !== undefined) this.context.getResponse().header('retry-after', String(retryAfterSeconds));
    throw error;
  }

  private cookies(): Record<string, string> {
    return parseCookies(this.context.getRequest().headers.cookie);
  }

  /** `protocol`/`hostname` honour `x-forwarded-*` when the deployment trusts its proxy, so this is the origin the browser actually reached */
  private requestOrigin(): string {
    const request = this.context.getRequest();
    return `${request.protocol}://${request.hostname}`;
  }

  private send(response: HttpResponse, cookies: string[], redirectTo?: string): void {
    for (const cookie of cookies) response.header('set-cookie', cookie);
    if (redirectTo) response.redirect(redirectTo, FOUND);
  }
}
