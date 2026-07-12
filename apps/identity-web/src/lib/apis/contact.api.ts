/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type AddContactResponse, type ContactItemDto, type ContactListResponse } from './api-types.gen';

/**
 * Defining types
 */

/** An email or phone the user has claimed; `verifiedAt` present once proven. */
export type ContactItem = ContactItemDto;
export type AddContactResult = AddContactResponse;
export type { ContactListResponse };

export interface VerifyContactInput {
  verificationId: string;
  code: string;
}

/**
 * Declaring the constants
 */
export const contactKeys = {
  emails: ['contacts', 'emails'] as const,
  phones: ['contacts', 'phones'] as const,
};

/* ---------- emails ---------- */

export function useEmailsQuery(): UseQueryResult<ContactListResponse, ApiError> {
  return useQuery<ContactListResponse, ApiError>({ queryKey: contactKeys.emails, queryFn: () => APIRequest.get('/me/emails').execute() });
}

export function useAddEmailMutation(): UseMutationResult<AddContactResult, ApiError, string> {
  return useMutation<AddContactResult, ApiError, string>({ mutationFn: email => APIRequest.post('/me/emails').body({ email }).execute() });
}

export function useVerifyEmailMutation(): UseMutationResult<undefined, ApiError, VerifyContactInput> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, VerifyContactInput>({
    mutationFn: input => APIRequest.post('/me/emails/verify').body(input).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

export function useSetPrimaryEmailMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: email => APIRequest.post('/me/emails/primary').body({ email }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

export function useRemoveEmailMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: email => APIRequest.delete('/me/emails').body({ email }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

/* ---------- phones ---------- */

export function usePhonesQuery(): UseQueryResult<ContactListResponse, ApiError> {
  return useQuery<ContactListResponse, ApiError>({ queryKey: contactKeys.phones, queryFn: () => APIRequest.get('/me/phones').execute() });
}

export function useAddPhoneMutation(): UseMutationResult<AddContactResult, ApiError, string> {
  return useMutation<AddContactResult, ApiError, string>({ mutationFn: phone => APIRequest.post('/me/phones').body({ phone }).execute() });
}

export function useVerifyPhoneMutation(): UseMutationResult<undefined, ApiError, VerifyContactInput> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, VerifyContactInput>({
    mutationFn: input => APIRequest.post('/me/phones/verify').body(input).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}

export function useSetPrimaryPhoneMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: phone => APIRequest.post('/me/phones/primary').body({ phone }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}

export function useRemovePhoneMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: phone => APIRequest.delete('/me/phones').body({ phone }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}
