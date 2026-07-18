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
const stepUp = createServerFn({ method: 'POST' })
  .validator((code: string) => code)
  .handler(({ data }) => serverFetch<StepUpState>({ method: 'POST', path: '/me/mfa/step-up', body: { code: data } }));
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

/** Elevate the current session to AAL2 with a TOTP code (the step-up ceremony). */
export function useStepUpMutation(): UseMutationResult<StepUpState, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<StepUpState, ApiError, string>({
    mutationFn: code => call(stepUp({ data: code })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all }),
  });
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
