/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * These interfaces mirror the server DTOs in `src/modules` one-to-one; the client never widens
 * them. Flow endpoints answer 200/401/429 with typed bodies rather than error envelopes, so the
 * request core exposes the status code instead of throwing on every non-2xx.
 */

export type ChallengeMethodName = 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP';

export interface ChallengeMethodMetadata {
  maskedEmail?: string;
  maskedPhone?: string;
}

export interface FlowState {
  flowId: string;
  status: string;
  attemptsLeft?: number;
  resendsLeft?: number;
  hasAlternativeMethods?: boolean;
  metadata?: ChallengeMethodMetadata;
}

export interface ChallengeMethod {
  name: ChallengeMethodName;
  metadata?: ChallengeMethodMetadata;
}

export interface ResendResult {
  status: 'SENT' | 'LIMITED';
  resendsLeft?: number;
  retryAfterSeconds?: number;
}

export interface WebauthnChallenge {
  flowId?: string;
  options: Record<string, unknown>;
}

export interface Me {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  aal: 'AAL1' | 'AAL2';
  elevated: boolean;
  elevatedUntil?: string;
}

export interface ConsentScope {
  name: string;
  description?: string;
  isSensitive: boolean;
}

export interface ConsentPrompt {
  clientName: string;
  isFirstParty: boolean;
  alreadyGranted: boolean;
  scopes: ConsentScope[];
}

export interface ConsentDecision {
  decision: 'APPROVE' | 'DENY';
  redirectTo?: string;
}

export interface MfaEnrollment {
  type: 'TOTP' | 'WEBAUTHN' | 'EMAIL_OTP';
  label: string;
  createdAt: string;
  lastUsedAt?: string;
  credentialId?: string;
}

export interface TotpEnrollment {
  secret: string;
  uri: string;
}

export interface TotpActivation {
  success: boolean;
  recoveryCodes?: string[];
}

export interface StepUpState {
  aal: 'AAL1' | 'AAL2';
  elevatedUntil: string;
}

export interface SessionItem {
  id: string;
  aal: 'AAL1' | 'AAL2';
  createdAt: string;
  lastUsedAt: string;
  ipAddress?: string;
  ipCountry?: string;
  userAgent?: string;
  deviceName?: string;
  isCurrent: boolean;
}

export interface ContactItem {
  value: string;
  isPrimary: boolean;
  verifiedAt?: string;
}

export interface ErrorEnvelope {
  code: string;
  type: string;
  message: string;
  fields?: { field: string; msg: string }[];
}

export interface CookieAccess {
  get(name: string): string | undefined;
  set(name: string, value: string, maxAgeSeconds: number): void;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface ApiOptions {
  fetchImpl?: FetchLike;
  cookies?: CookieAccess;
}

/**
 * Declaring the constants
 */
const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_SELF_MINT_TTL_SECONDS = 3600;

/** Raised for responses the caller did not model — carries the machine code for the error page. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: { field: string; msg: string }[],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const browserCookies: CookieAccess = {
  get(name: string): string | undefined {
    const prefix = `${name}=`;
    const entry = document.cookie.split('; ').find(part => part.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
  },
  set(name: string, value: string, maxAgeSeconds: number): void {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
  },
};

const randomHex = (bytes: number): string => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
};

export class IdentityApi {
  private readonly fetchImpl: FetchLike;
  private readonly cookies: CookieAccess;

  constructor(options: ApiOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.cookies = options.cookies ?? browserCookies;
  }

  /**
   * Double-submit CSRF: the server refreshes the `csrf-token` cookie on every cookied response,
   * so normally the client just echoes it. A cookieless first visit mints its own pair — the
   * middleware only compares cookie and header, it does not require a server-issued value.
   */
  csrfToken(): string {
    const existing = this.cookies.get(CSRF_COOKIE);
    if (existing) {
      const [expiry, token] = existing.split(':');
      if (expiry && token && parseInt(expiry, 36) > Date.now()) return token;
    }
    const token = randomHex(16);
    const expiresAt = (Date.now() + CSRF_SELF_MINT_TTL_SECONDS * 1000).toString(36);
    this.cookies.set(CSRF_COOKIE, `${expiresAt}:${token}`, CSRF_SELF_MINT_TTL_SECONDS);
    return token;
  }

  private async request<T>(method: string, path: string, body?: unknown, modeled: number[] = []): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = { accept: 'application/json', [CSRF_HEADER]: this.csrfToken() };
    if (body !== undefined) headers['content-type'] = 'application/json';

    const response = await this.fetchImpl(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);

    if (response.ok || modeled.includes(response.status)) return { status: response.status, body: payload as T };

    const envelope = (payload ?? {}) as Partial<ErrorEnvelope>;
    const retryAfter = response.headers.get('retry-after');
    throw new ApiError(
      response.status,
      envelope.code ?? 'UNEXPECTED',
      envelope.message ?? 'Something went wrong',
      envelope.fields,
      retryAfter ? parseInt(retryAfter, 10) : undefined,
    );
  }

  private flow(promise: Promise<{ status: number; body: FlowState }>): Promise<FlowState> {
    return promise.then(result => result.body);
  }

  /* ---------- interactive auth flows ---------- */

  loginInit(identifier: string, deviceId?: string): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/login/init', { identifier, deviceId }));
  }

  registerInit(email: string, deviceId?: string): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/register/init', { email, deviceId }));
  }

  registerDemographics(flowId: string, dateOfBirth: string, gender: string): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/register/demographics', { flowId, dateOfBirth, gender }));
  }

  registerProfile(flowId: string, firstName: string, lastName: string): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/register/profile', { flowId, firstName, lastName }));
  }

  registerPassword(flowId: string, password: string): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/register/password', { flowId, password }, [401]));
  }

  recoverInit(identifier: string, deviceId?: string): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/recover/init', { identifier, deviceId }));
  }

  recoverReset(flowId: string, newPassword: string): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/recover/reset', { flowId, newPassword }, [401]));
  }

  /** Password, OTP code, recovery code, or WebAuthn assertion — 401 carries the typed retry state. */
  challengeVerify(flowId: string, proof: { password?: string; code?: string; recoveryCode?: string; webauthn?: Record<string, unknown> }): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/challenge/verify', { flowId, ...proof }, [401]));
  }

  async challengeMethods(flowId: string): Promise<ChallengeMethod[]> {
    const result = await this.request<{ methods: ChallengeMethod[] }>('GET', `/api/v1/auth/challenge/methods?flowId=${encodeURIComponent(flowId)}`);
    return result.body.methods;
  }

  challengeChange(flowId: string, method: ChallengeMethodName): Promise<FlowState> {
    return this.flow(this.request('POST', '/api/v1/auth/challenge/change', { flowId, method }));
  }

  async challengeResend(flowId: string, method: 'EMAIL_OTP' | 'SMS_OTP'): Promise<ResendResult> {
    const result = await this.request<ResendResult>('POST', '/api/v1/auth/challenge/resend', { flowId, method }, [429]);
    return result.body;
  }

  async webauthnOptions(flowId?: string, deviceId?: string): Promise<WebauthnChallenge> {
    const result = await this.request<WebauthnChallenge>('POST', '/api/v1/auth/webauthn/options', { flowId, deviceId });
    return result.body;
  }

  async cancelFlow(flowId: string): Promise<void> {
    await this.request('POST', '/api/v1/auth/cancel', { flowId });
  }

  async signout(): Promise<void> {
    await this.request('POST', '/api/v1/auth/signout', {});
  }

  /* ---------- session identity ---------- */

  async me(): Promise<Me> {
    return (await this.request<Me>('GET', '/api/v1/me')).body;
  }

  /* ---------- consent ---------- */

  async consentPrompt(clientId: string, scope: string): Promise<ConsentPrompt> {
    const query = `clientId=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}`;
    return (await this.request<ConsentPrompt>('GET', `/api/v1/auth/consent?${query}`)).body;
  }

  async consentDecide(body: { clientId: string; scopeNames: string[]; decision: 'APPROVE' | 'DENY'; redirectUri?: string; state?: string }): Promise<ConsentDecision> {
    return (await this.request<ConsentDecision>('POST', '/api/v1/auth/consent', body)).body;
  }

  /* ---------- mfa management ---------- */

  async mfaEnrollments(): Promise<MfaEnrollment[]> {
    return (await this.request<{ enrollments: MfaEnrollment[] }>('GET', '/api/v1/me/mfa')).body.enrollments;
  }

  async totpEnroll(): Promise<TotpEnrollment> {
    return (await this.request<TotpEnrollment>('POST', '/api/v1/me/mfa/totp/enroll', {})).body;
  }

  async totpActivate(code: string): Promise<TotpActivation> {
    return (await this.request<TotpActivation>('POST', '/api/v1/me/mfa/totp/activate', { code })).body;
  }

  async totpRemove(): Promise<void> {
    await this.request('DELETE', '/api/v1/me/mfa/totp');
  }

  async stepUp(code: string): Promise<StepUpState> {
    return (await this.request<StepUpState>('POST', '/api/v1/me/mfa/step-up', { code })).body;
  }

  async regenerateRecoveryCodes(): Promise<string[]> {
    return (await this.request<{ recoveryCodes: string[] }>('POST', '/api/v1/me/mfa/recovery-codes', {})).body.recoveryCodes;
  }

  async webauthnRegisterOptions(): Promise<Record<string, unknown>> {
    return (await this.request<Record<string, unknown>>('POST', '/api/v1/me/webauthn/register/options', {})).body;
  }

  async webauthnRegisterVerify(attestation: Record<string, unknown>, label?: string): Promise<TotpActivation> {
    return (await this.request<TotpActivation>('POST', '/api/v1/me/webauthn/register/verify', { ...attestation, label })).body;
  }

  async webauthnRemove(credentialId: string): Promise<void> {
    await this.request('DELETE', `/api/v1/me/webauthn/${encodeURIComponent(credentialId)}`);
  }

  /* ---------- sessions ---------- */

  async sessions(): Promise<SessionItem[]> {
    return (await this.request<{ sessions: SessionItem[] }>('GET', '/api/v1/me/sessions')).body.sessions;
  }

  async revokeSession(sessionId: string): Promise<number> {
    return (await this.request<{ revoked: number }>('DELETE', `/api/v1/me/sessions/${encodeURIComponent(sessionId)}`)).body.revoked;
  }

  async revokeOtherSessions(): Promise<number> {
    return (await this.request<{ revoked: number }>('DELETE', '/api/v1/me/sessions')).body.revoked;
  }

  /* ---------- emails & phones ---------- */

  async listEmails(): Promise<ContactItem[]> {
    return (await this.request<{ items: ContactItem[] }>('GET', '/api/v1/me/emails')).body.items;
  }

  async addEmail(email: string): Promise<string> {
    return (await this.request<{ verificationId: string }>('POST', '/api/v1/me/emails', { email })).body.verificationId;
  }

  async verifyEmail(verificationId: string, code: string): Promise<void> {
    await this.request('POST', '/api/v1/me/emails/verify', { verificationId, code });
  }

  async setPrimaryEmail(email: string): Promise<void> {
    await this.request('POST', '/api/v1/me/emails/primary', { email });
  }

  async removeEmail(email: string): Promise<void> {
    await this.request('DELETE', '/api/v1/me/emails', { email });
  }

  async listPhones(): Promise<ContactItem[]> {
    return (await this.request<{ items: ContactItem[] }>('GET', '/api/v1/me/phones')).body.items;
  }

  async addPhone(phone: string): Promise<string> {
    return (await this.request<{ verificationId: string }>('POST', '/api/v1/me/phones', { phone })).body.verificationId;
  }

  async verifyPhone(verificationId: string, code: string): Promise<void> {
    await this.request('POST', '/api/v1/me/phones/verify', { verificationId, code });
  }

  async setPrimaryPhone(phone: string): Promise<void> {
    await this.request('POST', '/api/v1/me/phones/primary', { phone });
  }

  async removePhone(phone: string): Promise<void> {
    await this.request('DELETE', '/api/v1/me/phones', { phone });
  }
}

export const api = new IdentityApi();
