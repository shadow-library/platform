/**
 * Importing npm packages
 */
import { Controller, EnableIf, Handler } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { Body, ContextService, Get, HttpController, type HttpResponse, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AppSessionService } from './app-session.service';
import {
  AuthCallbackQuery,
  AuthLoginQuery,
  AuthLogoutResponse,
  AuthOrganisationsResponse,
  AuthSessionResponse,
  AuthStepUpQuery,
  BackchannelLogoutBody,
  BackchannelLogoutResponse,
  SwitchOrganisationBody,
  SwitchOrganisationResponse,
} from './auth.dto';
import { AuthRoutePaths } from './config';
import { parseCookies } from './cookie';
import { AuthGuardErrorCode } from './errors';

/**
 * Defining types
 */

type RouteName = keyof Omit<AuthRoutePaths, 'basePath'>;

/**
 * Declaring the constants
 *
 * The browser-facing surface a consuming service inherits rather than writes. Paths and enablement
 * are resolved once by `AuthModule.forRoot()` and stamped onto this class before the framework scans
 * it: `EnableIf` reads the registry below and any overridden path is written over the default the
 * decorators declared. That is why the registry is module-scoped mutable state — route metadata is
 * settled at class-definition time, long before a provider could be injected to supply it.
 *
 * Cookies are read off the raw request rather than through `@Cookie()` on purpose: that decorator
 * pulls in the optional `@fastify/cookie` peer, and needing an extra install would break the promise
 * that `AuthModule.forRoot()` plus environment variables is the entire integration.
 */
const ROUTE_HANDLERS: [RouteName, string][] = [
  ['login', 'login'],
  ['callback', 'callback'],
  ['logout', 'logout'],
  ['backchannelLogout', 'backchannelLogout'],
  ['session', 'session'],
  ['stepUp', 'stepUp'],
  ['organisations', 'organisations'],
  ['organisation', 'switchOrganisation'],
];

let routes: AuthRoutePaths | null = null;

const isEnabled = (route: RouteName): boolean => Boolean(routes?.[route]);

/** 302 keeps the browser's method on a redirect the user follows interactively */
const FOUND = 302;

/** Applies the resolved paths to the controller; must run before the module registry scans the class */
export function configureAuthRoutes(resolved: AuthRoutePaths): void {
  routes = resolved;
  Controller({ path: resolved.basePath })(AuthController);

  for (const [route, handler] of ROUTE_HANDLERS) {
    const path = resolved[route];
    const descriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, handler);
    if (path && descriptor) Handler({ path })(AuthController.prototype, handler, descriptor);
  }
}

@HttpController('/auth')
export class AuthController {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthController.name);

  constructor(
    private readonly sessions: AppSessionService,
    private readonly context: ContextService,
  ) {}

  /** Starts the login: PKCE, `state`, `nonce` and `resource` out, the transient state into its own cookie */
  @Get('/login')
  @EnableIf(() => isEnabled('login'))
  async login(@Query() query: AuthLoginQuery): Promise<void> {
    const response = this.context.getResponse();
    const redirect = await this.sessions.beginLogin(query.return_to);
    this.send(response, redirect.cookies, redirect.url);
  }

  /** Redeems the code for an opaque app-session handle and puts it in this application's own cookie */
  @Get('/callback')
  @EnableIf(() => isEnabled('callback'))
  async callback(@Query() query: AuthCallbackQuery): Promise<void> {
    if (query.error) throw AuthErrorCode.EXCHANGE_FAILED.create({ reason: `identity refused the authorization: ${query.error_description ?? query.error}` });

    const result = await this.sessions.completeLogin(query, this.cookies());
    this.send(this.context.getResponse(), result.cookies, result.returnTo);
  }

  /**
   * Ends this application's session. The central identity session survives it, unless a post-logout
   * redirect is configured and the browser is handed on to identity's RP-initiated logout.
   */
  @Post('/logout')
  @EnableIf(() => isEnabled('logout'))
  @RespondFor(200, AuthLogoutResponse)
  async logout(): Promise<AuthLogoutResponse | undefined> {
    const response = this.context.getResponse();
    const cleared = await this.sessions.logout(this.sessions.readHandle(this.cookies()));
    const redirectTo = await this.sessions.endSessionUrl();
    this.send(response, cleared, redirectTo);
    return redirectTo ? undefined : { success: true };
  }

  /**
   * Accepts identity's back-channel logout notice and drops every local session of that user along
   * with their cached tokens. Answers 200 even when nothing matched — the notice is about the
   * identity session, and this application may simply never have had one for it.
   */
  @Post('/backchannel-logout')
  @EnableIf(() => isEnabled('backchannelLogout'))
  @RespondFor(200, BackchannelLogoutResponse)
  async backchannelLogout(@Body() body: BackchannelLogoutBody): Promise<BackchannelLogoutResponse> {
    await this.sessions.handleBackchannelLogout(body.logout_token);
    return { success: true };
  }

  /** Lets a browser client discover its login state without ever parsing — or seeing — a token */
  @Get('/session')
  @EnableIf(() => isEnabled('session'))
  @RespondFor(200, AuthSessionResponse)
  async session(): Promise<AuthSessionResponse> {
    const handle = this.sessions.readHandle(this.cookies());
    if (!handle) throw AuthGuardErrorCode.IAM_001.create();

    const principal = await this.sessions.resolvePrincipal(handle);
    return { sub: principal.sub, scopes: principal.scopes, org: principal.org, aal: principal.aal, clientId: principal.clientId };
  }

  /** The organisations this session may act in; a browser client renders a switcher only when there is more than one */
  @Get('/organisations')
  @EnableIf(() => isEnabled('organisations'))
  @RespondFor(200, AuthOrganisationsResponse)
  async organisations(): Promise<AuthOrganisationsResponse> {
    const handle = this.sessions.readHandle(this.cookies());
    if (!handle) throw AuthGuardErrorCode.IAM_001.create();

    return { organisations: await this.sessions.listOrganisations(handle) };
  }

  /**
   * Switches the organisation this session acts in. Identity rotates the handle, so the response
   * carries a replacement cookie — a client that keeps the old one is logged out, by design.
   */
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
   * The step-up landing point. It first tries to *claim* an existing step-up — the user may already
   * have satisfied identity elsewhere — and only prompts when there is nothing to claim.
   *
   * Both failures lead back to the prompt, but for opposite reasons, so each gets its own marker to
   * keep the bounce from becoming a loop. `claimed` says a prompt has already been answered and there
   * was still nothing to claim, which is terminal. `retried` says the step-up existed but named
   * another beneficiary (D-19) — a claim can never fix that, only a fresh prompt carrying this
   * application's intent can, and it gets exactly one.
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

  /** Carries both markers forward, so neither failure can bounce the browser more than once each */
  private promptUrl(returnTo: string, outcome: 'absent' | 'mismatch', query: AuthStepUpQuery): Promise<string> {
    const markers = [outcome === 'absent' || query.claimed ? 'claimed=1' : '', outcome === 'mismatch' || query.retried ? 'retried=1' : ''].filter(Boolean);
    return this.sessions.identityStepUpUrl(`${this.sessions.stepUpUrl(returnTo)}&${markers.join('&')}`);
  }

  private cookies(): Record<string, string> {
    return parseCookies(this.context.getRequest().headers.cookie);
  }

  private send(response: HttpResponse, cookies: string[], redirectTo?: string): void {
    for (const cookie of cookies) response.header('set-cookie', cookie);
    if (redirectTo) response.redirect(redirectTo, FOUND);
  }
}
