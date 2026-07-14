/**
 * Importing npm packages
 */
import { type UseMutationResult, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type JsonObject } from '@/types';

import { type ApiError, call } from './api-request';
import {
  type ChallengeMethod,
  type ChallengeMethodMetadata,
  type ChallengeResendResponse,
  type ConsentDecisionBody,
  type ConsentDecisionResponse,
  type ConsentPromptResponse,
  type ConsentScopeDto,
  type FederatedLoginOptionDto,
} from './api-types.gen';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 *
 * The interactive-auth DTOs come from the generated OpenAPI schema (`api-types.gen.ts`); the client-only
 * abstractions below (`FlowState`, `ChallengeProof`, `WebauthnChallenge`) compose them into the shapes the
 * flow pages actually render. Flow endpoints answer 200/401/429 with typed bodies rather than error
 * envelopes, so those statuses are `modeled` on the server function and resolve to a `FlowState`, not a throw.
 */

export type { ChallengeMethod, ChallengeMethodMetadata, ConsentDecisionBody };
export type ChallengeMethodName = ChallengeMethod['name'];
export type FederatedLoginOption = FederatedLoginOptionDto;
export type ResendResult = ChallengeResendResponse;
export type ConsentScope = ConsentScopeDto;
export type ConsentPrompt = ConsentPromptResponse;
export type ConsentDecision = ConsentDecisionResponse;

/** The single source of truth the flow pages render from — clients switch on `status`, never sequence. */
export interface FlowState {
  flowId: string;
  status: string;
  attemptsLeft?: number;
  resendsLeft?: number;
  retryAfterSeconds?: number;
  hasAlternativeMethods?: boolean;
  metadata?: ChallengeMethodMetadata;
  federated?: FederatedLoginOption;
  /** OIDC handoff: present on COMPLETED when the flow began at `/oauth2/authorize`. */
  resumeUrl?: string;
}

export interface WebauthnChallenge {
  flowId?: string;
  options: JsonObject;
}

/** Proof for `challenge/verify` — exactly one of these is set per step. */
export interface ChallengeProof {
  password?: string;
  code?: string;
  recoveryCode?: string;
  webauthn?: Record<string, unknown>;
}

/**
 * Declaring the server functions
 *
 * Each interactive-auth endpoint is a TanStack Start server function so the flow's session/CSRF cookies
 * ride along on both SSR and client-driven steps. The `authApi` facade below preserves the imperative
 * signatures the `useFlow` state machine drives.
 */
const loginInitFn = createServerFn({ method: 'POST' })
  .validator((body: { identifier: string; deviceId?: string; returnTo?: string }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/login/init', body: data }));

const registerInitFn = createServerFn({ method: 'POST' })
  .validator((body: { email: string; deviceId?: string }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/register/init', body: data }));

const registerDemographicsFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId: string; dateOfBirth?: string; gender?: string }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/register/demographics', body: data }));

const registerProfileFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId: string; firstName: string; lastName: string }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/register/profile', body: data }));

const registerPasswordFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId: string; password: string }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/register/password', body: data, modeled: [401] }));

const recoverInitFn = createServerFn({ method: 'POST' })
  .validator((body: { identifier: string; deviceId?: string }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/recover/init', body: data }));

const recoverResetFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId: string; newPassword: string }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/recover/reset', body: data, modeled: [401] }));

const challengeVerifyFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId: string } & ChallengeProof) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/challenge/verify', body: data, modeled: [401] }));

const challengeMethodsFn = createServerFn({ method: 'GET' })
  .validator((flowId: string) => flowId)
  .handler(({ data }) => serverFetch<{ methods: ChallengeMethod[] }>({ method: 'GET', path: '/auth/challenge/methods', query: { flowId: data } }));

const challengeChangeFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId: string; method: ChallengeMethodName }) => body)
  .handler(({ data }) => serverFetch<FlowState>({ method: 'POST', path: '/auth/challenge/change', body: data }));

const challengeResendFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId: string; method: 'EMAIL_OTP' | 'SMS_OTP' }) => body)
  .handler(({ data }) => serverFetch<ResendResult>({ method: 'POST', path: '/auth/challenge/resend', body: data, modeled: [429] }));

const webauthnOptionsFn = createServerFn({ method: 'POST' })
  .validator((body: { flowId?: string; deviceId?: string }) => body)
  .handler(({ data }) => serverFetch<WebauthnChallenge>({ method: 'POST', path: '/auth/webauthn/options', body: data }));

const cancelFlowFn = createServerFn({ method: 'POST' })
  .validator((flowId: string) => flowId)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/auth/cancel', body: { flowId: data } }));

const consentPromptFn = createServerFn({ method: 'GET' })
  .validator((query: { clientId: string; scope: string }) => query)
  .handler(({ data }) => serverFetch<ConsentPrompt>({ method: 'GET', path: '/auth/consent', query: data }));

const consentDecideFn = createServerFn({ method: 'POST' })
  .validator((body: ConsentDecisionBody) => body)
  .handler(({ data }) => serverFetch<ConsentDecision>({ method: 'POST', path: '/auth/consent', body: data }));

const signoutFn = createServerFn({ method: 'POST' }).handler(() => serverFetch<undefined>({ method: 'POST', path: '/auth/signout', body: {} }));

/**
 * Declaring the constants
 */

/** Query options for the sign-in consent prompt — the consent route loads it before rendering. */
export const consentPromptQueryOptions = (clientId: string, scope: string, enabled = true) =>
  queryOptions<ConsentPrompt, ApiError>({
    queryKey: ['auth', 'consent', clientId, scope] as const,
    queryFn: () => call(consentPromptFn({ data: { clientId, scope } })),
    retry: false,
    enabled: enabled && Boolean(clientId && scope),
  });

/**
 * The interactive-auth flow client. Unlike the rest of the API these are imperative (a login walks a
 * server-driven state machine, not a cache), so they are plain async functions the `useFlow` hook
 * drives — not TanStack Query hooks.
 */
export const authApi = {
  loginInit(identifier: string, deviceId?: string, returnTo?: string): Promise<FlowState> {
    return call(loginInitFn({ data: { identifier, deviceId, returnTo } }));
  },

  registerInit(email: string, deviceId?: string): Promise<FlowState> {
    return call(registerInitFn({ data: { email, deviceId } }));
  },

  registerDemographics(flowId: string, dateOfBirth?: string, gender?: string): Promise<FlowState> {
    return call(registerDemographicsFn({ data: { flowId, dateOfBirth: dateOfBirth || undefined, gender: gender || undefined } }));
  },

  registerProfile(flowId: string, firstName: string, lastName: string): Promise<FlowState> {
    return call(registerProfileFn({ data: { flowId, firstName, lastName } }));
  },

  registerPassword(flowId: string, password: string): Promise<FlowState> {
    return call(registerPasswordFn({ data: { flowId, password } }));
  },

  recoverInit(identifier: string, deviceId?: string): Promise<FlowState> {
    return call(recoverInitFn({ data: { identifier, deviceId } }));
  },

  recoverReset(flowId: string, newPassword: string): Promise<FlowState> {
    return call(recoverResetFn({ data: { flowId, newPassword } }));
  },

  /** Password, OTP code, recovery code, or WebAuthn assertion — 401 carries the typed retry state. */
  challengeVerify(flowId: string, proof: ChallengeProof): Promise<FlowState> {
    return call(challengeVerifyFn({ data: { flowId, ...proof } }));
  },

  async challengeMethods(flowId: string): Promise<ChallengeMethod[]> {
    const result = await call(challengeMethodsFn({ data: flowId }));
    return result.methods;
  },

  challengeChange(flowId: string, method: ChallengeMethodName): Promise<FlowState> {
    return call(challengeChangeFn({ data: { flowId, method } }));
  },

  challengeResend(flowId: string, method: 'EMAIL_OTP' | 'SMS_OTP'): Promise<ResendResult> {
    return call(challengeResendFn({ data: { flowId, method } }));
  },

  webauthnOptions(flowId?: string, deviceId?: string): Promise<WebauthnChallenge> {
    return call(webauthnOptionsFn({ data: { flowId, deviceId } }));
  },

  cancelFlow(flowId: string): Promise<void> {
    return call(cancelFlowFn({ data: flowId }));
  },

  consentPrompt(clientId: string, scope: string): Promise<ConsentPrompt> {
    return call(consentPromptFn({ data: { clientId, scope } }));
  },

  consentDecide(body: ConsentDecisionBody): Promise<ConsentDecision> {
    return call(consentDecideFn({ data: body }));
  },
};

/** Ends the current session (revokes it + its refresh families) and clears every cached query. */
export function useSignoutMutation(): UseMutationResult<undefined, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, undefined>({
    mutationFn: () => call(signoutFn()),
    onSuccess: () => queryClient.clear(),
  });
}
