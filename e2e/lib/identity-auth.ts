/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from './api';
import { clientIpHeaders } from './client-ip';
import { requireProductUrl } from './env';
import { totpCode } from './totp';

/**
 * Defining types
 */

type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

export interface LoginInitOptions {
  /** Sent as `deviceId`; identity keeps one `devices` row per user and fingerprint. */
  deviceId?: string;
}

export interface ChallengeVerifyRequest {
  flowId: string;
  password?: string;
  code?: string;
  recoveryCode?: string;
}

export interface FlowStepBody {
  flowId?: string;
  status?: string;
  attemptsLeft?: number;
  resendsLeft?: number;
  hasAlternativeMethods?: boolean;
  code?: string;
  metadata?: { maskedEmail?: string; maskedPhone?: string };
}

export interface PasswordSignIn {
  readonly flowId: string;
  /** The `challenge/verify` answer to the password. */
  readonly response: APIResponse;
}

/**
 * Declaring the constants
 *
 * Drives identity's public auth-flow API (`/api/v1/auth/*`) from a spec. A context that completes a login holds `__Host-sid`
 * afterwards, and from then on identity enforces CSRF on its POSTs — so start each login on a fresh `identityApi` context.
 */

/** A cheap authenticated GET that makes identity issue the `csrf-token` cookie a session-bearing mutation must echo. */
export const IDENTITY_CSRF_SEED_PATH = '/api/v1/me';

export class IdentityAuthError extends Error {
  override readonly name = 'IdentityAuthError';
}

/** An unauthenticated identity context whose every request is charged to `clientIp`. */
export function identityApi(clientIp: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL: requireProductUrl('identity'), ignoreHTTPSErrors: true, extraHTTPHeaders: clientIpHeaders(clientIp) });
}

/** A CSRF-correct mutation on an identity context that carries a session. */
export function identityMutate(ctx: APIRequestContext, method: MutationMethod, path: string, data?: unknown): Promise<APIResponse> {
  return mutate(ctx, method, path, { data, csrfSeedPath: IDENTITY_CSRF_SEED_PATH });
}

export function loginInit(ctx: APIRequestContext, identifier: string, options: LoginInitOptions = {}): Promise<APIResponse> {
  return ctx.post('/api/v1/auth/login/init', { data: { identifier, ...(options.deviceId ? { deviceId: options.deviceId } : {}) } });
}

export function verifyChallenge(ctx: APIRequestContext, body: ChallengeVerifyRequest): Promise<APIResponse> {
  return ctx.post('/api/v1/auth/challenge/verify', { data: body });
}

export function changeChallenge(ctx: APIRequestContext, flowId: string, method: 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP'): Promise<APIResponse> {
  return ctx.post('/api/v1/auth/challenge/change', { data: { flowId, method } });
}

export function resendChallenge(ctx: APIRequestContext, flowId: string, method: 'EMAIL_OTP' | 'SMS_OTP'): Promise<APIResponse> {
  return ctx.post('/api/v1/auth/challenge/resend', { data: { flowId, method } });
}

/** Opens a login flow for `identifier`, throwing unless identity answers 200 with a flow id. */
export async function startLogin(ctx: APIRequestContext, identifier: string, options: LoginInitOptions = {}): Promise<string> {
  const response = await loginInit(ctx, identifier, options);
  const body = (await response.json()) as FlowStepBody;
  if (response.status() !== 200 || !body.flowId) throw new IdentityAuthError(`login/init for ${identifier} answered ${response.status()}: ${JSON.stringify(body)}`);
  return body.flowId;
}

/** `login/init` then the password step; the caller asserts on the verify answer. */
export async function signInWithPassword(ctx: APIRequestContext, identifier: string, password: string, options: LoginInitOptions = {}): Promise<PasswordSignIn> {
  const flowId = await startLogin(ctx, identifier, options);
  return { flowId, response: await verifyChallenge(ctx, { flowId, password }) };
}

/**
 * Enrols and activates TOTP for the signed-in user of `ctx`, returning the base32 secret. Identity allows factor changes only
 * on a self-service-elevated session, so `ctx` must hold an AAL2 session with a live `elevated_until` and no elevation intent.
 * The activation spends the current 30 s step, so a code for that step is refused as a replay until the next one.
 */
export async function enrollTotp(ctx: APIRequestContext): Promise<string> {
  const enroll = await identityMutate(ctx, 'post', '/api/v1/me/mfa/totp/enroll');
  if (enroll.status() !== 200) throw new IdentityAuthError(`totp/enroll answered ${enroll.status()}: ${await enroll.text()}`);
  const { secret } = (await enroll.json()) as { secret: string };
  const activate = await identityMutate(ctx, 'post', '/api/v1/me/mfa/totp/activate', { code: totpCode(secret) });
  if (activate.status() !== 200) throw new IdentityAuthError(`totp/activate answered ${activate.status()}: ${await activate.text()}`);
  return secret;
}
