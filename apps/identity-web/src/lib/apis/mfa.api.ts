/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type MfaEnrollmentItem, type MfaEnrollmentsResponse, type StepUpResponse, type TotpActivateResponse, type TotpEnrollResponse } from './api-types.gen';
import { meKeys } from './me.api';

/**
 * Defining types
 */

export type MfaFactorType = MfaEnrollmentItem['type'];
export type MfaEnrollment = MfaEnrollmentItem;
export type TotpEnrollment = TotpEnrollResponse;
export type TotpActivation = TotpActivateResponse;
export type StepUpState = StepUpResponse;
export type { MfaEnrollmentsResponse };

/** The W3C credential-creation / assertion option blobs and the browser's attestation are opaque here. */
export type WebauthnOptions = Record<string, unknown>;
export type WebauthnAttestation = Record<string, unknown>;

/**
 * Declaring the constants
 */
export const mfaKeys = {
  all: ['mfa'] as const,
};

export function useMfaQuery(): UseQueryResult<MfaEnrollmentsResponse, ApiError> {
  return useQuery<MfaEnrollmentsResponse, ApiError>({
    queryKey: mfaKeys.all,
    queryFn: () => APIRequest.get('/me/mfa').execute(),
  });
}

/** Begin TOTP enrollment — returns the seed + otpauth URI to show once. */
export function useTotpEnrollMutation(): UseMutationResult<TotpEnrollment, ApiError, undefined> {
  return useMutation<TotpEnrollment, ApiError, undefined>({
    mutationFn: () => APIRequest.post('/me/mfa/totp/enroll').body({}).execute(),
  });
}

/** Activate the pending TOTP enrollment with a proof code; the first factor also returns recovery codes. */
export function useTotpActivateMutation(): UseMutationResult<TotpActivation, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<TotpActivation, ApiError, string>({
    mutationFn: code => APIRequest.post('/me/mfa/totp/activate').body({ code }).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mfaKeys.all });
      queryClient.invalidateQueries({ queryKey: meKeys.all });
    },
  });
}

export function useRemoveTotpMutation(): UseMutationResult<undefined, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, undefined>({
    mutationFn: () => APIRequest.delete('/me/mfa/totp').execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}

/** Elevate the current session to AAL2 with a TOTP code (the step-up ceremony). */
export function useStepUpMutation(): UseMutationResult<StepUpState, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<StepUpState, ApiError, string>({
    mutationFn: code => APIRequest.post('/me/mfa/step-up').body({ code }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all }),
  });
}

/** Regenerate the recovery-code batch (step-up required); the previous batch is retired atomically. */
export function useRegenerateRecoveryCodesMutation(): UseMutationResult<{ recoveryCodes: string[] }, ApiError, undefined> {
  return useMutation<{ recoveryCodes: string[] }, ApiError, undefined>({
    mutationFn: () => APIRequest.post('/me/mfa/recovery-codes').body({}).execute(),
  });
}

/** Fetch WebAuthn registration options for enrolling a passkey. */
export function useWebauthnRegisterOptionsMutation(): UseMutationResult<WebauthnOptions, ApiError, undefined> {
  return useMutation<WebauthnOptions, ApiError, undefined>({
    mutationFn: () => APIRequest.post('/me/webauthn/register/options').body({}).execute(),
  });
}

export interface WebauthnRegisterInput {
  attestation: WebauthnAttestation;
  label?: string;
}

/** Complete passkey registration; the first factor returns the recovery-code batch. */
export function useWebauthnRegisterVerifyMutation(): UseMutationResult<TotpActivation, ApiError, WebauthnRegisterInput> {
  const queryClient = useQueryClient();
  return useMutation<TotpActivation, ApiError, WebauthnRegisterInput>({
    mutationFn: ({ attestation, label }) =>
      APIRequest.post('/me/webauthn/register/verify')
        .body({ ...attestation, label })
        .execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}

export function useRemovePasskeyMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: credentialId => APIRequest.delete(`/me/webauthn/${encodeURIComponent(credentialId)}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}
