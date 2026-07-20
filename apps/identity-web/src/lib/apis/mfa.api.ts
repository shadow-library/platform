/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type JsonObject } from '@/types';

import { type ApiError, call } from './api-request';
import { type MfaEnrollmentItem, type MfaEnrollmentsResponse, type StepUpResponse, type TotpActivateResponse, type TotpEnrollResponse } from './api-types.gen';
import { meKeys } from './me.api';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

export type MfaFactorType = MfaEnrollmentItem['type'];
export type MfaEnrollment = MfaEnrollmentItem;
export type TotpEnrollment = TotpEnrollResponse;
export type TotpActivation = TotpActivateResponse;
export type StepUpState = StepUpResponse;
export type { MfaEnrollmentsResponse };

/** How a session may be elevated. `PASSWORD` is offered only to accounts with no second factor; an
 * empty list means the account must enrol a factor before it can perform sensitive actions. */
export type StepUpMethod = 'TOTP' | 'WEBAUTHN' | 'PASSWORD';
export interface StepUpMethodsResponse {
  methods: StepUpMethod[];
}
export interface StepUpProof {
  code?: string;
  password?: string;
}

/** The W3C credential-creation / assertion option blobs and the browser's attestation are opaque JSON — typed as
 * `JsonObject` (not `Record<string, unknown>`) so they satisfy the server-function serializability constraint. */
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

const fetchEnrollments = createServerFn({ method: 'GET' }).handler(() => serverFetch<MfaEnrollmentsResponse>({ method: 'GET', path: '/me/mfa' }));
const totpEnroll = createServerFn({ method: 'POST' }).handler(() => serverFetch<TotpEnrollment>({ method: 'POST', path: '/me/mfa/totp/enroll', body: {} }));
const totpActivate = createServerFn({ method: 'POST' })
  .validator((code: string) => code)
  .handler(({ data }) => serverFetch<TotpActivation>({ method: 'POST', path: '/me/mfa/totp/activate', body: { code: data } }));
const removeTotp = createServerFn({ method: 'POST' }).handler(() => serverFetch<undefined>({ method: 'DELETE', path: '/me/mfa/totp' }));
const fetchStepUpMethods = createServerFn({ method: 'GET' }).handler(() => serverFetch<StepUpMethodsResponse>({ method: 'GET', path: '/me/mfa/step-up/methods' }));
const stepUp = createServerFn({ method: 'POST' })
  .validator((proof: StepUpProof) => proof)
  .handler(({ data }) => serverFetch<StepUpState>({ method: 'POST', path: '/me/mfa/step-up', body: data }));
const stepUpPasskeyOptions = createServerFn({ method: 'POST' }).handler(() =>
  serverFetch<{ options: WebauthnOptions }>({ method: 'POST', path: '/me/webauthn/step-up/options', body: {} }),
);
const stepUpPasskeyVerify = createServerFn({ method: 'POST' })
  .validator((assertion: WebauthnAttestation) => assertion)
  .handler(({ data }) => serverFetch<StepUpState>({ method: 'POST', path: '/me/webauthn/step-up', body: data }));
const regenerateRecoveryCodes = createServerFn({ method: 'POST' }).handler(() =>
  serverFetch<{ recoveryCodes: string[] }>({ method: 'POST', path: '/me/mfa/recovery-codes', body: {} }),
);
const webauthnRegisterOptions = createServerFn({ method: 'POST' }).handler(() => serverFetch<WebauthnOptions>({ method: 'POST', path: '/me/webauthn/register/options', body: {} }));
const webauthnRegisterVerify = createServerFn({ method: 'POST' })
  .validator((input: WebauthnRegisterInput) => input)
  .handler(({ data }) => serverFetch<TotpActivation>({ method: 'POST', path: '/me/webauthn/register/verify', body: { ...data.attestation, label: data.label } }));
const removePasskey = createServerFn({ method: 'POST' })
  .validator((credentialId: string) => credentialId)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/me/webauthn/${encodeURIComponent(data)}` }));

export const mfaQueryOptions = () =>
  queryOptions<MfaEnrollmentsResponse, ApiError>({
    queryKey: mfaKeys.all,
    queryFn: () => call(fetchEnrollments()),
  });

export function useMfaQuery(): UseQueryResult<MfaEnrollmentsResponse, ApiError> {
  return useQuery(mfaQueryOptions());
}

/** Begin TOTP enrollment — returns the seed + otpauth URI to show once. */
export function useTotpEnrollMutation(): UseMutationResult<TotpEnrollment, ApiError, undefined> {
  return useMutation<TotpEnrollment, ApiError, undefined>({
    mutationFn: () => call(totpEnroll()),
  });
}

/** Activate the pending TOTP enrollment with a proof code; the first factor also returns recovery codes. */
export function useTotpActivateMutation(): UseMutationResult<TotpActivation, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<TotpActivation, ApiError, string>({
    mutationFn: code => call(totpActivate({ data: code })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mfaKeys.all });
      queryClient.invalidateQueries({ queryKey: meKeys.all });
    },
  });
}

export function useRemoveTotpMutation(): UseMutationResult<undefined, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, undefined>({
    mutationFn: () => call(removeTotp()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}

/** The methods the current account may use to elevate, so the UI never prompts for a factor it lacks. */
export function useStepUpMethodsQuery(enabled = true): UseQueryResult<StepUpMethodsResponse, ApiError> {
  return useQuery(
    queryOptions<StepUpMethodsResponse, ApiError>({
      queryKey: [...mfaKeys.all, 'step-up-methods'],
      queryFn: () => call(fetchStepUpMethods()),
      enabled,
    }),
  );
}

/** Elevate the current session to AAL2 with a TOTP code or — for accounts with no second factor — a password. */
export function useStepUpMutation(): UseMutationResult<StepUpState, ApiError, StepUpProof> {
  const queryClient = useQueryClient();
  return useMutation<StepUpState, ApiError, StepUpProof>({
    mutationFn: proof => call(stepUp({ data: proof })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all }),
  });
}

/** Options for the passkey step-up ceremony; the browser runs the assertion between this and verify. */
export function requestPasskeyStepUpOptions(): Promise<WebauthnOptions> {
  return call(stepUpPasskeyOptions()).then(result => result.options);
}

/** Completes a passkey step-up with the browser's assertion, elevating the session to AAL2. */
export function verifyPasskeyStepUp(assertion: WebauthnAttestation): Promise<StepUpState> {
  return call(stepUpPasskeyVerify({ data: assertion }));
}

/** Regenerate the recovery-code batch (step-up required); the previous batch is retired atomically. */
export function useRegenerateRecoveryCodesMutation(): UseMutationResult<{ recoveryCodes: string[] }, ApiError, undefined> {
  return useMutation<{ recoveryCodes: string[] }, ApiError, undefined>({
    mutationFn: () => call(regenerateRecoveryCodes()),
  });
}

/** Fetch WebAuthn registration options for enrolling a passkey. */
export function useWebauthnRegisterOptionsMutation(): UseMutationResult<WebauthnOptions, ApiError, undefined> {
  return useMutation<WebauthnOptions, ApiError, undefined>({
    mutationFn: () => call(webauthnRegisterOptions()),
  });
}

/** Complete passkey registration; the first factor returns the recovery-code batch. */
export function useWebauthnRegisterVerifyMutation(): UseMutationResult<TotpActivation, ApiError, WebauthnRegisterInput> {
  const queryClient = useQueryClient();
  return useMutation<TotpActivation, ApiError, WebauthnRegisterInput>({
    mutationFn: input => call(webauthnRegisterVerify({ data: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}

export function useRemovePasskeyMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: credentialId => call(removePasskey({ data: credentialId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}
