/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type JsonObject } from '@/types';

import { type ApiError, APIRequest } from './api-request';
import {
  type MfaEnrollmentItem,
  type MfaEnrollmentsResponse,
  type StepUpIntentResponse,
  type StepUpResponse,
  type TotpActivateResponse,
  type TotpEnrollResponse,
} from './api-types.gen';
import { meKeys } from './me.api';

/**
 * Defining types
 */

export type MfaFactorType = MfaEnrollmentItem['type'];
export type MfaEnrollment = MfaEnrollmentItem;
export type TotpEnrollment = TotpEnrollResponse;
export type TotpActivation = TotpActivateResponse;
export type StepUpState = StepUpResponse;
export type { MfaEnrollmentsResponse, StepUpIntentResponse };

/** How a session may be elevated. `PASSWORD` is offered only to accounts with no second factor; an
 * empty list means the account must enrol a factor before it can perform sensitive actions. */
export type StepUpMethod = 'TOTP' | 'WEBAUTHN' | 'PASSWORD';
export interface StepUpMethodsResponse {
  methods: StepUpMethod[];
}

/**
 * The application a step-up is performed *for* (D-19, T-801). Carried on the hosted `/step-up` prompt
 * so the elevation window it opens names its beneficiary; omitted for the console's own step-up, whose
 * window no application can claim.
 */
export interface StepUpIntent {
  clientId?: string;
  resource?: string;
}

export interface StepUpProof {
  code?: string;
  password?: string;
  clientId?: string;
  resource?: string;
}

/** The W3C credential-creation / assertion option blobs and the browser's attestation are opaque JSON — typed as
 * `JsonObject` (not `Record<string, unknown>`) so they stay JSON-serialisable end to end. */
export type WebauthnOptions = JsonObject;
export type WebauthnAttestation = JsonObject;

export interface WebauthnRegisterInput {
  attestation: WebauthnAttestation;
  label?: string;
}

/**
 * Declaring the constants
 */
export const mfaKeys = {
  all: ['mfa'] as const,
};

export const mfaQueryOptions = () =>
  queryOptions<MfaEnrollmentsResponse, ApiError>({
    queryKey: mfaKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/me/mfa').signal(signal).execute<MfaEnrollmentsResponse>(),
  });

export function useMfaQuery(): UseQueryResult<MfaEnrollmentsResponse, ApiError> {
  return useQuery(mfaQueryOptions());
}

/** Begin TOTP enrollment — returns the seed + otpauth URI to show once. */
export function useTotpEnrollMutation(): UseMutationResult<TotpEnrollment, ApiError, undefined> {
  return useMutation<TotpEnrollment, ApiError, undefined>({
    mutationFn: () => APIRequest.post('/me/mfa/totp/enroll').body({}).execute<TotpEnrollment>(),
  });
}

/** Activate the pending TOTP enrollment with a proof code; the first factor also returns recovery codes. */
export function useTotpActivateMutation(): UseMutationResult<TotpActivation, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<TotpActivation, ApiError, string>({
    mutationFn: code => APIRequest.post('/me/mfa/totp/activate').body({ code }).execute<TotpActivation>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mfaKeys.all });
      queryClient.invalidateQueries({ queryKey: meKeys.all });
    },
  });
}

export function useRemoveTotpMutation(): UseMutationResult<undefined, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, undefined>({
    mutationFn: () => APIRequest.delete('/me/mfa/totp').execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}

/** The methods the current account may use to elevate, so the UI never prompts for a factor it lacks. */
export function useStepUpMethodsQuery(enabled = true): UseQueryResult<StepUpMethodsResponse, ApiError> {
  return useQuery(
    queryOptions<StepUpMethodsResponse, ApiError>({
      queryKey: [...mfaKeys.all, 'step-up-methods'],
      queryFn: ({ signal }) => APIRequest.get('/me/mfa/step-up/methods').signal(signal).execute<StepUpMethodsResponse>(),
      enabled,
    }),
  );
}

/** Resolves a client id to its owning application's display name for the hosted step-up prompt (D-19, T-801).
 *  `applicationName` is absent for an unknown/tampered id — the prompt renders that as a neutral failure. */
export const stepUpIntentQueryOptions = (clientId: string, enabled = true) =>
  queryOptions<StepUpIntentResponse, ApiError>({
    queryKey: [...mfaKeys.all, 'step-up-intent', clientId],
    queryFn: ({ signal }) => APIRequest.get('/me/mfa/step-up/intent').query({ clientId }).signal(signal).execute<StepUpIntentResponse>(),
    retry: false,
    enabled: enabled && Boolean(clientId),
  });

export function useStepUpIntentQuery(clientId: string, enabled = true): UseQueryResult<StepUpIntentResponse, ApiError> {
  return useQuery(stepUpIntentQueryOptions(clientId, enabled));
}

/** Elevate the current session to AAL2 with a TOTP code or — for accounts with no second factor — a password. */
export function useStepUpMutation(): UseMutationResult<StepUpState, ApiError, StepUpProof> {
  const queryClient = useQueryClient();
  return useMutation<StepUpState, ApiError, StepUpProof>({
    mutationFn: proof => APIRequest.post('/me/mfa/step-up').body(proof).execute<StepUpState>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all }),
  });
}

/** Options for the passkey step-up ceremony; the browser runs the assertion between this and verify. */
export function requestPasskeyStepUpOptions(): Promise<WebauthnOptions> {
  return APIRequest.post('/me/webauthn/step-up/options')
    .body({})
    .execute<{ options: WebauthnOptions }>()
    .then(result => result.options);
}

/** Completes a passkey step-up with the browser's assertion, elevating the session to AAL2. An `intent`
 *  binds the resulting window to the application it names (D-19, T-801); omitted for a console step-up. */
export function verifyPasskeyStepUp(assertion: WebauthnAttestation, intent?: StepUpIntent): Promise<StepUpState> {
  return APIRequest.post('/me/webauthn/step-up')
    .body({ ...assertion, clientId: intent?.clientId, resource: intent?.resource })
    .execute<StepUpState>();
}

/** Regenerate the recovery-code batch (step-up required); the previous batch is retired atomically. */
export function useRegenerateRecoveryCodesMutation(): UseMutationResult<{ recoveryCodes: string[] }, ApiError, undefined> {
  return useMutation<{ recoveryCodes: string[] }, ApiError, undefined>({
    mutationFn: () => APIRequest.post('/me/mfa/recovery-codes').body({}).execute<{ recoveryCodes: string[] }>(),
  });
}

/** Fetch WebAuthn registration options for enrolling a passkey. */
export function useWebauthnRegisterOptionsMutation(): UseMutationResult<WebauthnOptions, ApiError, undefined> {
  return useMutation<WebauthnOptions, ApiError, undefined>({
    mutationFn: () => APIRequest.post('/me/webauthn/register/options').body({}).execute<WebauthnOptions>(),
  });
}

/** Complete passkey registration; the first factor returns the recovery-code batch. */
export function useWebauthnRegisterVerifyMutation(): UseMutationResult<TotpActivation, ApiError, WebauthnRegisterInput> {
  const queryClient = useQueryClient();
  return useMutation<TotpActivation, ApiError, WebauthnRegisterInput>({
    mutationFn: input =>
      APIRequest.post('/me/webauthn/register/verify')
        .body({ ...input.attestation, label: input.label })
        .execute<TotpActivation>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}

export function useRemovePasskeyMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: credentialId => APIRequest.delete(`/me/webauthn/${encodeURIComponent(credentialId)}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}
