/**
 * Importing npm packages
 */
import { Config, Logger, utils } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { type AuthClientConfig } from '../interfaces';
import { assertValidCookieName, type CookieAttributes, type SameSitePolicy } from './cookie';
import { LOGIN_STATE_TTL_SECONDS } from './login-state';

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    /** Auth SDK configs (consumed by `AuthModule.forRoot` / `RelyingPartyModule.forRoot`) */
    'auth.issuer': string;
    'auth.identity-url': string;
    'auth.app-id': string;
    'auth.client.id': string;
    'auth.client.secret': string;
    'auth.client.assertion-path': string;
    'auth.timeout': number;
    'auth.app.refresh-seconds': number;
    'auth.service-access.refresh-seconds': number;
    'auth.strict-scopes': boolean;

    /** First-party browser flow configs (consumed by `AuthModule.forRoot`) */
    'auth.browser-login': boolean;
    'auth.session.cookie-name': string;
    'auth.session.cookie-secure': boolean;
    'auth.session.cookie-same-site': SameSitePolicy;
    'auth.session.cookie-domain': string;
    'auth.post-login-redirect': string;
    'auth.post-logout-redirect': string;
    'auth.allowed-redirects': string[];
  }
}

/** The browser-facing surface `AuthModule.forRoot()` registers; every path is overridable and any route may be turned off */
export interface AuthRoutePaths {
  basePath: string;
  login: string | false;
  callback: string | false;
  logout: string | false;
  backchannelLogout: string | false;
  session: string | false;
  stepUp: string | false;
}

export interface BrowserAuthOptions {
  /**
   * Defaults to on whenever a credential is configured, because identity already knows this
   * application's redirect URIs and granted scopes — there is nothing left for a deploy to supply.
   * An API-only service turns it off here or with `AUTH_BROWSER_LOGIN=false`.
   */
  enabled?: boolean;

  /**
   * Overrides the redirect URI identity has registered for this application. Only for a deployment
   * behind a proxy that rewrites the callback path; normally the registration is the truth.
   */
  redirectUri?: string;

  /** Overrides the scopes an admin granted this application; narrows, it cannot grant */
  scopes?: string[];

  /** Overrides discovery's `step_up_endpoint`; the endpoint is derived, not configured */
  stepUpUrl?: string;

  postLoginRedirect?: string;

  /** Where identity sends the browser after an RP-initiated logout; omitted, logout ends here */
  postLogoutRedirect?: string;

  /** Absolute origins (optionally with a path prefix) a `return_to` may point at; same-origin paths are always allowed */
  allowedRedirects?: string[];

  cookieName?: string;
  cookieSameSite?: SameSitePolicy;
  cookieDomain?: string;

  /**
   * The escape hatch for plain-HTTP development only. Turning it off drops the `Secure` attribute and
   * therefore the `__Host-` prefix with it, which is why it warns loudly and must never reach production.
   */
  cookieSecure?: boolean;

  /** Checks the granted scopes against the issuer's published `scopes_supported` at startup; on by default */
  validateScopes?: boolean;
}

/** Everything is optional: whatever is not passed in code is resolved from the environment */
export interface AuthModuleOptions extends Partial<AuthClientConfig> {
  browser?: BrowserAuthOptions;
  routes?: Partial<AuthRoutePaths>;
}

/**
 * The locally-decided half of the browser configuration. Audience, redirect URI, granted scopes and
 * the step-up endpoint are deliberately absent: they come from identity at runtime (D-21), so they
 * cannot be settled here at `forRoot()` time. Only the overrides for them live here.
 */
export interface ResolvedBrowserAuthConfig {
  enabled: boolean;
  routes: AuthRoutePaths;
  redirectUri?: string;
  scopes?: string[];
  stepUpUrl?: string;
  postLoginRedirect: string;
  postLogoutRedirect?: string;
  allowedRedirects: string[];
  validateScopes: boolean;
  cookieName: string;
  cookie: CookieAttributes;
  stateCookieName: string;
  stateCookie: CookieAttributes;
}

/**
 * Declaring the constants
 *
 * A steady-state deploy configures three things: `AUTH_ISSUER`, `AUTH_APP_ID`, and one credential —
 * a projected service-account token at `AUTH_CLIENT_ASSERTION_PATH` in-cluster, or a static
 * `AUTH_CLIENT_SECRET` outside it. Everything identity already stores about the application is read
 * back from it (D-21): the audience its tokens are addressed to, the redirect URIs an admin
 * registered, the scopes an admin granted, and the step-up endpoint from discovery. Restating those
 * in environment variables is what the old `AUTH_AUDIENCE` / `AUTH_REDIRECT_URI` / `AUTH_SCOPES` /
 * `AUTH_STEP_UP_URL` did, and they are gone rather than deprecated — a stale value in a deploy
 * silently overriding what identity says is worse than having no override at all. The escape hatch is
 * `browser: { … }` in code, where it is visible and reviewed.
 *
 * The rest tunes behaviour and has safe defaults. The one setting that can weaken security —
 * `AUTH_SESSION_COOKIE_SECURE` — announces itself in the logs when it is used.
 */
Config.load('auth.issuer');

/**
 * Where back-channel traffic reaches identity when that is not the public issuer — in-cluster,
 * `http://identity-server.identity`. Unset outside a cluster, where the issuer is reachable
 * directly. Browser-facing endpoints are unaffected; see `AuthClientConfig.identityUrl`.
 */
Config.load('auth.identity-url');

/** Without it a production service cannot read its own registration back, and so cannot know its own audience */
Config.load('auth.app-id', { isProdRequired: true });
Config.load('auth.client.id');
Config.load('auth.client.secret');
Config.load('auth.client.assertion-path');
Config.load('auth.timeout', { validateType: 'number' });
Config.load('auth.app.refresh-seconds', { validateType: 'number', defaultValue: '300' });
Config.load('auth.service-access.refresh-seconds', { validateType: 'number', defaultValue: '300' });
Config.load('auth.strict-scopes', { validateType: 'boolean', defaultValue: 'false' });
Config.load('auth.browser-login', { validateType: 'boolean', defaultValue: 'true' });
Config.load('auth.session.cookie-name', { defaultValue: '__Host-shadow-session' });
Config.load('auth.session.cookie-secure', { validateType: 'boolean', defaultValue: 'true' });
Config.load('auth.session.cookie-same-site', { allowedValues: ['Lax', 'Strict', 'None'], defaultValue: 'Lax' });
Config.load('auth.session.cookie-domain');
Config.load('auth.post-login-redirect', { defaultValue: '/' });
Config.load('auth.post-logout-redirect');
Config.load('auth.allowed-redirects', { isArray: true });

const logger = Logger.getLogger(NAMESPACE, 'AuthConfig');

/** The login-state cookie shares the session cookie's name so both stand or fall on the same prefix rules */
const STATE_COOKIE_SUFFIX = '-login';

const DEFAULT_ROUTES: AuthRoutePaths = {
  basePath: '/auth',
  login: '/login',
  callback: '/callback',
  logout: '/logout',

  /**
   * Off by default. First-party revocation is pull-based: identity ends the central session and the
   * next mint from that handle fails, so it never sends a back-channel logout to an app-session
   * client — the route would sit there accepting nothing. It stays available for the third-party
   * `RelyingParty` path, where a logout token really is the only notice a consumer gets.
   */
  backchannelLogout: false,
  session: '/session',
  stepUp: '/step-up',
};

/** Fills any option not supplied in code from the corresponding `AUTH_*` environment config */
export function resolveAuthClientConfig(options: AuthModuleOptions = {}): AuthClientConfig {
  const issuer = options.issuer ?? Config.get('auth.issuer');
  const identityUrl = options.identityUrl ?? Config.get('auth.identity-url') ?? undefined;
  const appId = options.appId ?? Config.get('auth.app-id') ?? undefined;

  /** The app id doubles as the OAuth client id, so a deploy names the application once and only once */
  let client = options.client;
  const clientId = Config.get('auth.client.id') || appId;
  if (!client && clientId) {
    client = { id: clientId, secret: Config.get('auth.client.secret') || undefined, assertionPath: Config.get('auth.client.assertion-path') || undefined };
  }

  const timeout = options.timeout ?? Config.get('auth.timeout');
  const app = { refreshSeconds: options.app?.refreshSeconds ?? Config.get('auth.app.refresh-seconds') };
  const serviceAccess = { refreshSeconds: options.serviceAccess?.refreshSeconds ?? Config.get('auth.service-access.refresh-seconds') };
  const strictScopes = options.strictScopes ?? Config.get('auth.strict-scopes');

  return { ...utils.object.omitKeys(options, ['browser', 'routes']), issuer, identityUrl, appId, client, timeout, app, serviceAccess, strictScopes };
}

export function resolveAuthRoutes(overrides: Partial<AuthRoutePaths> = {}): AuthRoutePaths {
  return { ...DEFAULT_ROUTES, ...overrides };
}

/**
 * Resolves the browser-facing half. It stays off without client credentials, because minting on a
 * browser's behalf is impossible without the application's own M2M credential — registering the
 * routes anyway would only hand callers a login that cannot complete.
 */
export function resolveBrowserAuthConfig(client: AuthClientConfig, routes: AuthRoutePaths, options: BrowserAuthOptions = {}): ResolvedBrowserAuthConfig {
  const enabled = (options.enabled ?? Config.get('auth.browser-login')) && Boolean(client.client);
  const secure = options.cookieSecure ?? Config.get('auth.session.cookie-secure');
  const sameSite = options.cookieSameSite ?? Config.get('auth.session.cookie-same-site');
  const domain = options.cookieDomain ?? Config.get('auth.session.cookie-domain') ?? undefined;
  const cookieName = options.cookieName ?? Config.get('auth.session.cookie-name');

  const cookie: CookieAttributes = { path: '/', httpOnly: true, secure, sameSite, domain };
  if (enabled) {
    if (!secure) logger.warn('session cookies are configured without the Secure attribute; this is for plain-http development only and must never reach production');
    if (sameSite === 'None') {
      logger.warn(
        'session cookies are configured with SameSite=None, which sends them on cross-site requests; the application must supply its own CSRF defence on every state-changing route',
      );
    }
    assertValidCookieName(cookieName, cookie);
  }

  return {
    enabled,
    routes,
    redirectUri: options.redirectUri,
    scopes: options.scopes,
    stepUpUrl: options.stepUpUrl,
    postLoginRedirect: options.postLoginRedirect ?? Config.get('auth.post-login-redirect'),
    postLogoutRedirect: options.postLogoutRedirect ?? Config.get('auth.post-logout-redirect') ?? undefined,
    allowedRedirects: options.allowedRedirects ?? Config.get('auth.allowed-redirects') ?? [],
    validateScopes: options.validateScopes ?? true,
    cookieName,
    cookie,
    stateCookieName: `${cookieName}${STATE_COOKIE_SUFFIX}`,

    /**
     * The login-state cookie has to survive identity redirecting the browser back, which is a
     * cross-site top-level navigation — `Strict` would withhold it and no login could ever complete.
     * It is the one attribute the state cookie does not inherit.
     */
    stateCookie: { ...cookie, sameSite: sameSite === 'Strict' ? 'Lax' : sameSite, maxAge: LOGIN_STATE_TTL_SECONDS },
  };
}
