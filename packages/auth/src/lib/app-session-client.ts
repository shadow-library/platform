import { AppError, Logger, throwError } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import {
  AppSession,
  AppSessionCreateInput,
  AppSessionElevation,
  AppSessionOrganisation,
  AppSessionToken,
  AppSessionTokenInput,
  FetchLike,
  SwitchedOrganisation,
} from '../interfaces';
import { retryAfterSecondsOf, TOO_MANY_REQUESTS } from './transport';

export interface AppSessionClientOptions {
  baseUrl: string;
  fetchFn: FetchLike;

  /** Must carry the `app-session:manage` scope */
  getToken: () => Promise<string>;

  invalidateToken: () => void;

  strictScopes?: boolean;
}

interface ErrorBody {
  code?: string;
  error?: string;
  message?: string;
}

// Every route is machine-to-machine: the caller proves it is this application with its own M2M token and the handle only says which session is meant.
// That split is the security property the model rests on, so the handle stays in request bodies, is never logged, and reaches no host but identity.
const SESSIONS_PATH = '/api/v1/app-sessions';

const SESSION_INVALID_CODE = 'AUTH_005';
const ELEVATION_REQUIRED_CODE = 'AUTH_006';

/** The step-up named another beneficiary; a retry cannot fix it, only a fresh prompt can */
const ELEVATION_INTENT_MISMATCH_CODES = ['AUTH_007', 'elevation_intent_mismatch'];

/** On the organisation routes these mean "not reachable through that one" */
const ACCESS_DENIED_CODES = ['APP_006', 'APP_007'];

/** RFC 6749 §5.2 codes, both as identity's catalog keys and as bare OAuth strings */
const INVALID_GRANT_CODES = ['OAU_003', 'invalid_grant'];
const INVALID_TARGET_CODES = ['OAU_005', 'invalid_target'];
const INVALID_SCOPE_CODES = ['OAU_004', 'invalid_scope'];

export class AppSessionClient {
  private readonly logger = Logger.getLogger(NAMESPACE, AppSessionClient.name);
  private readonly baseUrl: string;

  constructor(private readonly options: AppSessionClientOptions) {
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}${SESSIONS_PATH}`;
  }

  async createSession(input: AppSessionCreateInput): Promise<AppSession> {
    const session = await this.request<AppSession>('POST', '', input);
    this.logger.info('app session created', { userId: session.userId, expiresAt: session.expiresAt, scope: session.scope });
    return session;
  }

  async mintToken(input: AppSessionTokenInput): Promise<AppSessionToken> {
    const minted = await this.request<AppSessionToken>('POST', '/token', input);
    const token: AppSessionToken = { ...minted, grantedScopes: parseScopes(minted.scope) };
    if (input.elevated && token.aal !== 'AAL2') {
      throw this.logged(AuthErrorCode.ELEVATION_REQUIRED.create({ reason: `identity answered an elevated mint with aal '${String(token.aal)}'` }));
    }
    this.assertScopesSurvived(input, token);
    this.logger.debug('app session token minted', { audience: token.audience, scope: token.scope, aal: token.aal, expiresIn: token.expiresIn });
    return token;
  }

  async claimElevation(sessionHandle: string, resource: string): Promise<AppSessionElevation> {
    const elevation = await this.request<AppSessionElevation>('POST', '/elevation', { sessionHandle, resource });
    this.logger.info('elevation grant claimed', { resource, expiresAt: elevation.expiresAt });
    return elevation;
  }

  /** A POST because the handle is a bearer secret and must not reach a query string, access log or `Referer` header */
  async listOrganisations(sessionHandle: string): Promise<AppSessionOrganisation[]> {
    const body = await this.request<{ organisations: AppSessionOrganisation[] }>('POST', '/organisations', { sessionHandle });
    return body.organisations;
  }

  async switchOrganisation(sessionHandle: string, organisationId: string): Promise<SwitchedOrganisation> {
    const switched = await this.request<SwitchedOrganisation>('POST', '/organisation', { sessionHandle, organisationId });
    this.logger.info('app session switched organisation', { organisationId: switched.organisationId, expiresAt: switched.expiresAt });
    return switched;
  }

  async revokeSession(sessionHandle: string): Promise<void> {
    await this.request<{ success: boolean }>('DELETE', '', { sessionHandle });
    this.logger.info('app session revoked');
  }

  /**
   * Minting answers 200 with whatever scope survived, so a caller that never compares gets a token quietly missing a capability; the delta is always logged and
   * `strictScopes` makes it fatal
   */
  private assertScopesSurvived(input: AppSessionTokenInput, token: AppSessionToken): void {
    const requested = parseScopes(input.scope);
    const dropped = requested.filter(scope => !token.grantedScopes.includes(scope));
    if (dropped.length === 0) return;

    const detail = { resource: input.resource, requested, granted: token.grantedScopes, dropped };
    if (this.options.strictScopes) throw this.logged(AuthErrorCode.SCOPE_NOT_GRANTED.create({ reason: `identity dropped the scope(s) '${dropped.join(', ')}'` }));
    this.logger.warn('identity narrowed the minted scope; the token carries less than was requested', detail);
  }

  /** One retry only when our own M2M token was rejected; a 401 attributed to the handle is terminal */
  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    const response = await this.dispatch(method, path, body, await this.options.getToken());
    if (response.status !== 401) return this.parse<T>(response, method, path);

    const failure = await this.readError(response);
    if (failure.code === SESSION_INVALID_CODE) throw this.logged(AuthErrorCode.SESSION_INVALID.create({ reason: failure.reason }));

    this.logger.warn('app session call rejected with 401; retrying with a fresh service token', { path });
    this.options.invalidateToken();
    return this.parse<T>(await this.dispatch(method, path, body, await this.options.getToken()), method, path);
  }

  private dispatch(method: string, path: string, body: unknown, token: string): Promise<Response> {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    return this.options
      .fetchFn(`${this.baseUrl}${path}`, { method, headers, body: JSON.stringify(body) })
      .catch((error: Error) => throwError(this.logged(AuthErrorCode.APP_SESSION_FAILED.create({ reason: `${method} ${SESSIONS_PATH}${path} failed: ${error.message}` }))));
  }

  /** A throttle is marked with identity's hint so the guard can answer a retryable 503 instead of restarting the login */
  private async parse<T>(response: Response, method: string, path: string): Promise<T> {
    if (response.ok) return (await response.json()) as T;
    if (response.status === TOO_MANY_REQUESTS) {
      const retryAfterSeconds = retryAfterSecondsOf(response);
      throw this.logged(AuthErrorCode.APP_SESSION_FAILED.create({ reason: `${SESSIONS_PATH}${path} was throttled`, throttled: true, retryAfterSeconds }));
    }
    throw this.toError(response.status, await this.readError(response), method, path);
  }

  private async readError(response: Response): Promise<{ code?: string; reason: string }> {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    const code = body.code ?? body.error;
    return { code, reason: body.message ?? code ?? `http ${response.status}` };
  }

  private toError(status: number, failure: { code?: string; reason: string }, method: string, path: string): AppError {
    const code = failure.code ?? '';
    if (status === 401 && code === SESSION_INVALID_CODE) return this.logged(AuthErrorCode.SESSION_INVALID.create({ reason: failure.reason }));
    if (method === 'POST' && path === '' && INVALID_GRANT_CODES.includes(code)) return this.logged(AuthErrorCode.AUTHORIZATION_CODE_INVALID.create({ reason: failure.reason }));
    if (ELEVATION_INTENT_MISMATCH_CODES.includes(code)) return this.logged(AuthErrorCode.ELEVATION_INTENT_MISMATCH.create({ reason: failure.reason }));
    if (status === 403 && code === ELEVATION_REQUIRED_CODE) return this.logged(AuthErrorCode.ELEVATION_REQUIRED.create({ reason: failure.reason }));
    if (status === 403 && ACCESS_DENIED_CODES.includes(code)) return this.logged(AuthErrorCode.ORGANISATION_NOT_PERMITTED.create({ reason: failure.reason }));
    if (INVALID_TARGET_CODES.includes(code)) return this.logged(AuthErrorCode.RESOURCE_NOT_ENTITLED.create({ reason: failure.reason }));
    if (INVALID_SCOPE_CODES.includes(code)) return this.logged(AuthErrorCode.SCOPE_NOT_GRANTED.create({ reason: failure.reason }));
    return this.logged(AuthErrorCode.APP_SESSION_FAILED.create({ reason: `${SESSIONS_PATH}${path} returned http ${status}: ${failure.reason}` }));
  }

  private logged(error: AppError): AppError {
    this.logger.error(error.message, { code: error.code, reason: error.data?.reason });
    return error;
  }
}

function parseScopes(scope: string | undefined): string[] {
  return (scope ?? '').split(' ').filter(Boolean);
}
