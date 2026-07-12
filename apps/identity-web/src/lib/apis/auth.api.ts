/**
 * Importing npm packages
 */
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
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

/**
 * Defining types
 *
 * The interactive-auth DTOs come from the generated OpenAPI schema (`api-types.gen.ts`); the client-only
 * abstractions below (`FlowState`, `ChallengeProof`, `WebauthnChallenge`) compose them into the shapes the
 * flow pages actually render. Flow endpoints answer 200/401/429 with typed bodies rather than error
 * envelopes, so those statuses are `.modeled(...)` on the request and resolve to a `FlowState`, not a throw.
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
  options: Record<string, unknown>;
}

/** Proof for `challenge/verify` — exactly one of these is set per step. */
export interface ChallengeProof {
  password?: string;
  code?: string;
  recoveryCode?: string;
  webauthn?: Record<string, unknown>;
}

/**
 * Declaring the constants
 */

/**
 * The interactive-auth flow client. Unlike the rest of the API these are imperative (a login walks a
 * server-driven state machine, not a cache), so they are plain async functions the `useFlow` hook
 * drives — not TanStack Query hooks.
 */
export const authApi = {
  loginInit(identifier: string, deviceId?: string, returnTo?: string): Promise<FlowState> {
    return APIRequest.post('/auth/login/init').body({ identifier, deviceId, returnTo }).execute();
  },

  registerInit(email: string, deviceId?: string): Promise<FlowState> {
    return APIRequest.post('/auth/register/init').body({ email, deviceId }).execute();
  },

  registerDemographics(flowId: string, dateOfBirth?: string, gender?: string): Promise<FlowState> {
    return APIRequest.post('/auth/register/demographics')
      .body({ flowId, dateOfBirth: dateOfBirth || undefined, gender: gender || undefined })
      .execute();
  },

  registerProfile(flowId: string, firstName: string, lastName: string): Promise<FlowState> {
    return APIRequest.post('/auth/register/profile').body({ flowId, firstName, lastName }).execute();
  },

  registerPassword(flowId: string, password: string): Promise<FlowState> {
    return APIRequest.post('/auth/register/password').body({ flowId, password }).modeled(401).execute();
  },

  recoverInit(identifier: string, deviceId?: string): Promise<FlowState> {
    return APIRequest.post('/auth/recover/init').body({ identifier, deviceId }).execute();
  },

  recoverReset(flowId: string, newPassword: string): Promise<FlowState> {
    return APIRequest.post('/auth/recover/reset').body({ flowId, newPassword }).modeled(401).execute();
  },

  /** Password, OTP code, recovery code, or WebAuthn assertion — 401 carries the typed retry state. */
  challengeVerify(flowId: string, proof: ChallengeProof): Promise<FlowState> {
    return APIRequest.post('/auth/challenge/verify')
      .body({ flowId, ...proof })
      .modeled(401)
      .execute();
  },

  async challengeMethods(flowId: string): Promise<ChallengeMethod[]> {
    const result = await APIRequest.get('/auth/challenge/methods').query({ flowId }).execute<{ methods: ChallengeMethod[] }>();
    return result.methods;
  },

  challengeChange(flowId: string, method: ChallengeMethodName): Promise<FlowState> {
    return APIRequest.post('/auth/challenge/change').body({ flowId, method }).execute();
  },

  challengeResend(flowId: string, method: 'EMAIL_OTP' | 'SMS_OTP'): Promise<ResendResult> {
    return APIRequest.post('/auth/challenge/resend').body({ flowId, method }).modeled(429).execute();
  },

  webauthnOptions(flowId?: string, deviceId?: string): Promise<WebauthnChallenge> {
    return APIRequest.post('/auth/webauthn/options').body({ flowId, deviceId }).execute();
  },

  cancelFlow(flowId: string): Promise<void> {
    return APIRequest.post('/auth/cancel').body({ flowId }).execute();
  },

  consentPrompt(clientId: string, scope: string): Promise<ConsentPrompt> {
    return APIRequest.get('/auth/consent').query({ clientId, scope }).execute();
  },

  consentDecide(body: ConsentDecisionBody): Promise<ConsentDecision> {
    return APIRequest.post('/auth/consent').body(body).execute();
  },
};

/** Ends the current session (revokes it + its refresh families) and clears every cached query. */
export function useSignoutMutation(): UseMutationResult<undefined, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, undefined>({
    mutationFn: () => APIRequest.post('/auth/signout').body({}).execute(),
    onSuccess: () => queryClient.clear(),
  });
}
