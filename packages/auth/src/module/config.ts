import { Config, Logger, utils } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { type AuthAccessMode, type AuthClientConfig } from '../interfaces';
import { assertValidCookieName, type CookieAttributes, type SameSitePolicy } from './cookie';
import { LOGIN_STATE_TTL_SECONDS } from './login-state';

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
    'auth.access-mode': AuthAccessMode;

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
  /** The signed-in person's profile; the platform's answer to "who am I", so no app builds its own */
  userinfo: string | false;
  stepUp: string | false;
  /** Lists the organisations this session may act in; one entry means there is nothing to switch to */
  organisations: string | false;
  /** Switches the active organisation, rotating the session cookie as it goes */
  organisation: string | false;
  /** Tells a browser client whether this application serves anyone without a session, before it renders anything */
  access: string | false;
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

  /**
   * The access posture the application declares in code; `AUTH_ACCESS_MODE` overrides it, so a deploy
   * can take an application public or private without a release. Unset in both places, `public`.
   */
  defaultAccessMode?: AuthAccessMode;
}

/** Audience, granted scopes and the step-up endpoint are absent: they come from identity at runtime, so only their overrides live here */
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
  /** Marks a browser already sent back through authorize for sensitive-scope consent, so a second refusal answers 403 instead of looping */
  reconsentCookieName: string;
  reconsentCookie: CookieAttributes;
}

// A steady-state deploy sets only AUTH_ISSUER, AUTH_APP_ID and one credential (AUTH_CLIENT_ASSERTION_PATH in-cluster, AUTH_CLIENT_SECRET outside it).
// Audience, redirect URIs, scopes and the step-up endpoint are read back from identity and deliberately have no env override: a stale value silently overriding identity is
// worse than none.
// The escape hatch is `browser: { … }` in code, where it is visible and reviewed.
Config.load('auth.issuer');

// No default service name: a deployment naming its identity Service differently would dial an address nobody serves and fail as a timeout rather than a config error
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

/** Deliberately without a default: an unset value has to fall through to the mode the application declared in code */
Config.load('auth.access-mode', { allowedValues: ['public', 'private'] });

Config.load('auth.browser-login', { validateType: 'boolean', defaultValue: 'true' });
Config.load('auth.session.cookie-name', { defaultValue: '__Host-shadow-session' });
Config.load('auth.session.cookie-secure', { validateType: 'boolean', defaultValue: 'true' });
Config.load('auth.session.cookie-same-site', { allowedValues: ['Lax', 'Strict', 'None'], defaultValue: 'Lax' });
Config.load('auth.session.cookie-domain');
Config.load('auth.post-login-redirect', { defaultValue: '/' });
Config.load('auth.post-logout-redirect');
Config.load('auth.allowed-redirects', { isArray: true });

const logger = Logger.getLogger(NAMESPACE, 'AuthConfig');

/** Derived from the session cookie's name so the login-state cookie inherits the `__Host-` prefix its login-CSRF defence rests on; only that name is validated */
const STATE_COOKIE_SUFFIX = '-login';
const RECONSENT_COOKIE_SUFFIX = '-reconsent';

/** Long enough to cover a sign-in and the step-up that follows it */
const RECONSENT_TTL_SECONDS = 15 * 60;

const DEFAULT_ROUTES: AuthRoutePaths = {
  basePath: '/auth',
  login: '/login',
  callback: '/callback',
  logout: '/logout',

  // Off by default: first-party revocation is pull-based (the next mint from the handle fails), so identity never sends app-session clients a back-channel logout
  backchannelLogout: false,
  session: '/session',
  userinfo: '/userinfo',
  stepUp: '/step-up',
  organisations: '/organisations',
  organisation: '/organisation',
  access: '/access',
};

export function resolveAuthClientConfig(options: AuthModuleOptions = {}): AuthClientConfig {
  const issuer = options.issuer ?? Config.get('auth.issuer');
  const identityUrl = options.identityUrl ?? Config.get('auth.identity-url') ?? undefined;
  const appId = options.appId ?? Config.get('auth.app-id') ?? undefined;

  // The app id doubles as the OAuth client id
  let client = options.client;
  const clientId = Config.get('auth.client.id') || appId;
  if (!client && clientId) {
    client = { id: clientId, secret: Config.get('auth.client.secret') || undefined, assertionPath: Config.get('auth.client.assertion-path') || undefined };
  }

  const timeout = options.timeout ?? Config.get('auth.timeout');
  const app = { refreshSeconds: options.app?.refreshSeconds ?? Config.get('auth.app.refresh-seconds') };
  const serviceAccess = { refreshSeconds: options.serviceAccess?.refreshSeconds ?? Config.get('auth.service-access.refresh-seconds') };
  const strictScopes = options.strictScopes ?? Config.get('auth.strict-scopes');

  return { ...utils.object.omitKeys(options, ['browser', 'routes', 'defaultAccessMode']), issuer, identityUrl, appId, client, timeout, app, serviceAccess, strictScopes };
}

export function resolveAccessMode(options: AuthModuleOptions = {}): AuthAccessMode {
  return Config.get('auth.access-mode') ?? options.defaultAccessMode ?? 'public';
}

export function resolveAuthRoutes(overrides: Partial<AuthRoutePaths> = {}): AuthRoutePaths {
  return { ...DEFAULT_ROUTES, ...overrides };
}

// Off without client credentials: minting on a browser's behalf needs the application's own M2M credential, so the routes would offer a login that cannot complete
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

    // `Strict` would withhold the state cookie on identity's cross-site redirect back, so no login could complete
    stateCookie: { ...cookie, sameSite: sameSite === 'Strict' ? 'Lax' : sameSite, maxAge: LOGIN_STATE_TTL_SECONDS },
    reconsentCookieName: `${cookieName}${RECONSENT_COOKIE_SUFFIX}`,
    reconsentCookie: { ...cookie, sameSite: sameSite === 'Strict' ? 'Lax' : sameSite, maxAge: RECONSENT_TTL_SECONDS },
  };
}
