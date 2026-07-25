/**
 * Importing npm packages
 */
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AppSession, AppSessionCreateInput, AppSessionElevation, AppSessionToken, AppSessionTokenInput, FetchLike } from '../interfaces';

/**
 * Defining types
 */

export interface AppSessionClientOptions {
  issuer: string;
  fetchFn: FetchLike;

  /** Supplies the application's own M2M bearer, which must carry the `app-session:manage` scope */
  getToken: () => Promise<string>;

  /** Drops that cached M2M token so a rejected credential is retried once with a fresh one */
  invalidateToken: () => void;
}

interface ErrorBody {
  code?: string;
  error?: string;
  message?: string;
}

/**
 * Declaring the constants
 *
 * The client half of the first-party app-session protocol. Every route is machine-to-machine: the
 * caller proves it is *this* application with its own M2M token, and the handle only says *which*
 * of its sessions is meant. That split is the security property the whole model rests on, so the
 * handle never leaves this file's request bodies — it is not logged, and it never reaches any host
 * but the identity service.
 */
const SESSIONS_PATH = '/api/v1/app-sessions';

/** Identity's codes for the two failures a caller is expected to branch on rather than retry blindly */
const SESSION_INVALID_CODE = 'AUTH_005';
const ELEVATION_REQUIRED_CODE = 'AUTH_006';

/** RFC 6749 §5.2 codes, as identity's own catalog keys and as the bare OAuth strings */
const INVALID_TARGET_CODES = ['OAU_005', 'invalid_target'];
const INVALID_SCOPE_CODES = ['OAU_004', 'invalid_scope'];

export class AppSessionClient {
  private readonly logger = Logger.getLogger(NAMESPACE, AppSessionClient.name);
  private readonly baseUrl: string;

  constructor(private readonly options: AppSessionClientOptions) {
    this.baseUrl = `${options.issuer.replace(/\/+$/, '')}${SESSIONS_PATH}`;
  }

  /** Redeems the authorization code for an opaque session handle; the handle is returned only once */
  async createSession(input: AppSessionCreateInput): Promise<AppSession> {
    const session = await this.request<AppSession>('POST', '', input);
    this.logger.info('app session created', { userId: session.userId, expiresAt: session.expiresAt, scope: session.scope });
    return session;
  }

  /** Mints an access token from the session handle, optionally from its live step-up grant */
  async mintToken(input: AppSessionTokenInput): Promise<AppSessionToken> {
    const token = await this.request<AppSessionToken>('POST', '/token', input);
    if (input.elevated && token.aal !== 'AAL2') {
      throw this.logged(AuthErrorCode.ELEVATION_REQUIRED.create({ reason: `identity answered an elevated mint with aal '${String(token.aal)}'` }));
    }
    this.logger.debug('app session token minted', { audience: token.audience, scope: token.scope, aal: token.aal, expiresIn: token.expiresIn });
    return token;
  }

  /**
   * Spends the user's step-up on the identity domain into a grant for this app session and this
   * audience only. Answers `ELEVATION_REQUIRED` when the user has not stepped up yet.
   */
  async claimElevation(sessionHandle: string, resource: string): Promise<AppSessionElevation> {
    const elevation = await this.request<AppSessionElevation>('POST', '/elevation', { sessionHandle, resource });
    this.logger.info('elevation grant claimed', { resource, expiresAt: elevation.expiresAt });
    return elevation;
  }

  /** Ends this application's session only; the central identity session is untouched */
  async revokeSession(sessionHandle: string): Promise<void> {
    await this.request<{ success: boolean }>('DELETE', '', { sessionHandle });
    this.logger.info('app session revoked');
  }

  /**
   * One round trip with a single retry reserved for the case where *our own* M2M token was the thing
   * rejected. A 401 that identity attributes to the handle is terminal — retrying with a fresh
   * service token would only ask the same question twice.
   */
  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    const response = await this.dispatch(method, path, body, await this.options.getToken());
    if (response.status !== 401) return this.parse<T>(response, path);

    const failure = await this.readError(response);
    if (failure.code === SESSION_INVALID_CODE) throw this.logged(AuthErrorCode.SESSION_INVALID.create({ reason: failure.reason }));

    this.logger.warn('app session call rejected with 401; retrying with a fresh service token', { path });
    this.options.invalidateToken();
    return this.parse<T>(await this.dispatch(method, path, body, await this.options.getToken()), path);
  }

  private dispatch(method: string, path: string, body: unknown, token: string): Promise<Response> {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    return this.options
      .fetchFn(`${this.baseUrl}${path}`, { method, headers, body: JSON.stringify(body) })
      .catch((error: Error) => throwError(this.logged(AuthErrorCode.APP_SESSION_FAILED.create({ reason: `${method} ${SESSIONS_PATH}${path} failed: ${error.message}` }))));
  }

  private async parse<T>(response: Response, path: string): Promise<T> {
    if (response.ok) return (await response.json()) as T;
    throw this.toError(response.status, await this.readError(response), path);
  }

  private async readError(response: Response): Promise<{ code?: string; reason: string }> {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    const code = body.code ?? body.error;
    return { code, reason: body.message ?? code ?? `http ${response.status}` };
  }

  private toError(status: number, failure: { code?: string; reason: string }, path: string): AppError {
    const code = failure.code ?? '';
    if (status === 401 && code === SESSION_INVALID_CODE) return this.logged(AuthErrorCode.SESSION_INVALID.create({ reason: failure.reason }));
    if (status === 403 && code === ELEVATION_REQUIRED_CODE) return this.logged(AuthErrorCode.ELEVATION_REQUIRED.create({ reason: failure.reason }));
    if (INVALID_TARGET_CODES.includes(code)) return this.logged(AuthErrorCode.RESOURCE_NOT_ENTITLED.create({ reason: failure.reason }));
    if (INVALID_SCOPE_CODES.includes(code)) return this.logged(AuthErrorCode.SCOPE_NOT_GRANTED.create({ reason: failure.reason }));
    return this.logged(AuthErrorCode.APP_SESSION_FAILED.create({ reason: `${SESSIONS_PATH}${path} returned http ${status}: ${failure.reason}` }));
  }

  /** Records the failure at error level before it propagates, keeping guard throws single-line */
  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}
