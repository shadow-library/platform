/**
 * Importing npm packages
 */
import { Config, Logger, utils } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { type AuthClientConfig } from '../interfaces';
import { assertValidCookieName, type CookieAttributes, type SameSitePolicy } from './cookie';
import { InMemoryLoginStateStore, type LoginStateStore, SealedLoginStateStore } from './login-state';

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    /** Auth SDK configs (consumed by `AuthModule.forRoot` / `RelyingPartyModule.forRoot`) */
    'auth.issuer': string;
    'auth.audience': string;
    'auth.client.id': string;
    'auth.client.secret': string;
    'auth.client.assertion-path': string;
    'auth.timeout': number;
    'auth.service-access.refresh-seconds': number;

    /** First-party browser flow configs (consumed by `AuthModule.forRoot`) */
    'auth.redirect-uri': string;
    'auth.scopes': string;
    'auth.session.cookie-name': string;
    'auth.session.cookie-secure': boolean;
    'auth.session.cookie-same-site': SameSitePolicy;
    'auth.session.cookie-domain': string;
    'auth.session.secret': string;
    'auth.post-login-redirect': string;
    'auth.post-logout-redirect': string;
    'auth.allowed-redirects': string[];
    'auth.step-up-url': string;
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
  /** Defaults to on whenever a redirect uri and client credentials are configured; an API-only service simply sets neither */
  enabled?: boolean;

  redirectUri?: string;
  scopes?: string[];
  postLoginRedirect?: string;

  /** Where identity sends the browser after an RP-initiated logout; omitted, logout ends here */
  postLogoutRedirect?: string;

  /** Absolute origins (optionally with a path prefix) a `return_to` may point at; same-origin paths are always allowed */
  allowedRedirects?: string[];

  /** Where to send a browser that must step up; defaults to `{issuer}/auth/step-up` */
  stepUpUrl?: string;

  cookieName?: string;
  cookieSameSite?: SameSitePolicy;
  cookieDomain?: string;

  /**
   * The escape hatch for plain-HTTP development only. Turning it off drops the `Secure` attribute and
   * therefore the `__Host-` prefix with it, which is why it warns loudly and must never reach production.
   */
  cookieSecure?: boolean;

  /** Seals the transient login-state cookie; without it the SDK falls back to a single-instance in-memory store */
  sessionSecret?: string;

  /** Replace the transient login-state store, e.g. with a Redis-backed one for a multi-instance deployment */
  loginStateStore?: LoginStateStore;

  /** Checks the configured scopes against the issuer's published `scopes_supported` at startup; on by default */
  validateScopes?: boolean;
}

/** Everything is optional: whatever is not passed in code is resolved from the environment */
export interface AuthModuleOptions extends Partial<AuthClientConfig> {
  browser?: BrowserAuthOptions;
  routes?: Partial<AuthRoutePaths>;
}

export interface ResolvedBrowserAuthConfig {
  enabled: boolean;
  clientId: string;
  audience: string;
  routes: AuthRoutePaths;
  redirectUri: string;
  scopes: string[];
  postLoginRedirect: string;
  postLogoutRedirect?: string;
  allowedRedirects: string[];
  stepUpUrl: string;
  validateScopes: boolean;
  cookieName: string;
  cookie: CookieAttributes;
  stateCookieName: string;
  stateCookie: CookieAttributes;
  loginStateStore: LoginStateStore;
}

/**
 * Declaring the constants
 *
 * Deploys configure the SDK through the environment instead of code: `AUTH_ISSUER` and
 * `AUTH_AUDIENCE` identify the issuer and this service's API resource, while the client either
 * presents a static secret (`AUTH_CLIENT_SECRET`) or — preferred inside Kubernetes — a projected
 * service-account token whose file path is `AUTH_CLIENT_ASSERTION_PATH`. `AUTH_TIMEOUT` optionally
 * bounds every outbound request to a total time budget in milliseconds, and
 * `AUTH_SERVICE_ACCESS_REFRESH_SECONDS` sets how long a revoked M2M caller may keep its access.
 *
 * The browser flow adds `AUTH_REDIRECT_URI` and `AUTH_SCOPES`; setting those two is what turns the
 * login/callback/logout surface on. Everything else has a safe default, and the one setting that can
 * weaken security — `AUTH_SESSION_COOKIE_SECURE` — announces itself in the logs when it is used.
 */
Config.load('auth.issuer');
Config.load('auth.audience');
Config.load('auth.client.id');
Config.load('auth.client.secret');
Config.load('auth.client.assertion-path');
Config.load('auth.timeout', { validateType: 'number' });
Config.load('auth.service-access.refresh-seconds', { validateType: 'number', defaultValue: '300' });
Config.load('auth.redirect-uri');
Config.load('auth.scopes');
Config.load('auth.session.cookie-name', { defaultValue: '__Host-shadow-session' });
Config.load('auth.session.cookie-secure', { validateType: 'boolean', defaultValue: 'true' });
Config.load('auth.session.cookie-same-site', { allowedValues: ['Lax', 'Strict', 'None'], defaultValue: 'Lax' });
Config.load('auth.session.cookie-domain');
Config.load('auth.session.secret');
Config.load('auth.post-login-redirect', { defaultValue: '/' });
Config.load('auth.post-logout-redirect');
Config.load('auth.allowed-redirects', { isArray: true });
Config.load('auth.step-up-url');

const logger = Logger.getLogger(NAMESPACE, 'AuthConfig');

/** The login-state cookie shares the session cookie's name so both stand or fall on the same prefix rules */
const STATE_COOKIE_SUFFIX = '-login';

/** A login may stay in flight for ten minutes; the transient cookie expires with it */
const LOGIN_STATE_TTL_SECONDS = 600;

const DEFAULT_ROUTES: AuthRoutePaths = {
  basePath: '/auth',
  login: '/login',
  callback: '/callback',
  logout: '/logout',
  backchannelLogout: '/backchannel-logout',
  session: '/session',
  stepUp: '/step-up',
};

/** Fills any option not supplied in code from the corresponding `AUTH_*` environment config */
export function resolveAuthClientConfig(options: AuthModuleOptions = {}): AuthClientConfig {
  const issuer = options.issuer ?? Config.get('auth.issuer');
  const audience = options.audience ?? Config.get('auth.audience');

  let client = options.client;
  const clientId = Config.get('auth.client.id');
  if (!client && clientId) {
    client = { id: clientId, secret: Config.get('auth.client.secret') || undefined, assertionPath: Config.get('auth.client.assertion-path') || undefined };
  }

  const timeout = options.timeout ?? Config.get('auth.timeout');
  const serviceAccess = { refreshSeconds: options.serviceAccess?.refreshSeconds ?? Config.get('auth.service-access.refresh-seconds') };

  return { ...utils.object.omitKeys(options, ['browser', 'routes']), issuer, audience, client, timeout, serviceAccess };
}

export function resolveAuthRoutes(overrides: Partial<AuthRoutePaths> = {}): AuthRoutePaths {
  return { ...DEFAULT_ROUTES, ...overrides };
}

/**
 * Resolves the browser-facing half. It stays off until a redirect uri and client credentials both
 * exist, because minting on a browser's behalf is impossible without the app's own M2M credential —
 * registering the routes anyway would only hand callers a login that cannot complete.
 */
export function resolveBrowserAuthConfig(client: AuthClientConfig, routes: AuthRoutePaths, options: BrowserAuthOptions = {}): ResolvedBrowserAuthConfig {
  const redirectUri = options.redirectUri ?? Config.get('auth.redirect-uri') ?? '';
  const enabled = options.enabled ?? Boolean(redirectUri && client.client);
  const secure = options.cookieSecure ?? Config.get('auth.session.cookie-secure');
  const sameSite = options.cookieSameSite ?? Config.get('auth.session.cookie-same-site');
  const domain = options.cookieDomain ?? Config.get('auth.session.cookie-domain') ?? undefined;
  const cookieName = options.cookieName ?? Config.get('auth.session.cookie-name');

  const cookie: CookieAttributes = { path: '/', httpOnly: true, secure, sameSite, domain };
  if (enabled) {
    if (!URL.canParse(redirectUri)) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'AUTH_REDIRECT_URI must be an absolute url' });
    if (!secure) logger.warn('session cookies are configured without the Secure attribute; this is for plain-http development only and must never reach production');
    if (sameSite === 'None') {
      logger.warn(
        'session cookies are configured with SameSite=None, which sends them on cross-site requests; the application must supply its own CSRF defence on every state-changing route',
      );
    }
    assertValidCookieName(cookieName, cookie);
  }

  if (enabled && routes.callback) warnOnRedirectUriMismatch(redirectUri, `${routes.basePath}${routes.callback}`);

  return {
    enabled,
    clientId: client.client?.id ?? '',
    audience: client.audience,
    routes,
    redirectUri,
    scopes: options.scopes ?? parseScopes(Config.get('auth.scopes')),
    postLoginRedirect: options.postLoginRedirect ?? Config.get('auth.post-login-redirect'),
    postLogoutRedirect: options.postLogoutRedirect ?? Config.get('auth.post-logout-redirect') ?? undefined,
    allowedRedirects: options.allowedRedirects ?? Config.get('auth.allowed-redirects') ?? [],
    stepUpUrl: options.stepUpUrl ?? Config.get('auth.step-up-url') ?? `${client.issuer.replace(/\/+$/, '')}/auth/step-up`,
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
    loginStateStore: enabled ? resolveLoginStateStore(options) : new InMemoryLoginStateStore(),
  };
}

/**
 * A registered redirect uri that does not point at the callback route is the classic silent failure:
 * login works, the browser comes back to nothing. It stays a warning rather than an error because a
 * reverse proxy is perfectly entitled to rewrite the path in front of the service.
 */
function warnOnRedirectUriMismatch(redirectUri: string, callbackPath: string): void {
  const registered = URL.parse(redirectUri);
  if (!registered || registered.pathname === callbackPath) return;
  logger.warn('AUTH_REDIRECT_URI does not point at the callback route; identity will send the browser somewhere this service does not serve', {
    redirectPath: registered.pathname,
    callbackPath,
  });
}

/** `AUTH_SCOPES` is space separated, matching how a `scope` parameter travels on the wire */
function parseScopes(value: string | undefined): string[] {
  return (value ?? '').split(/\s+/).filter(Boolean);
}

function resolveLoginStateStore(options: BrowserAuthOptions): LoginStateStore {
  if (options.loginStateStore) return options.loginStateStore;

  const secret = options.sessionSecret ?? Config.get('auth.session.secret');
  if (secret) return new SealedLoginStateStore({ secret, ttlSeconds: LOGIN_STATE_TTL_SECONDS });

  logger.warn('AUTH_SESSION_SECRET is not set; in-flight logins are held in memory and will fail across instances — set it, or supply a shared loginStateStore');
  return new InMemoryLoginStateStore({ ttlSeconds: LOGIN_STATE_TTL_SECONDS });
}
