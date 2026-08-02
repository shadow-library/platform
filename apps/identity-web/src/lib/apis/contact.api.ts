/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type AddContactResponse, type ContactItemDto, type ContactListResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

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

/** ---------- emails ---------- */

export const emailsQueryOptions = () =>
  queryOptions<ContactListResponse, ApiError>({
    queryKey: contactKeys.emails,
    queryFn: ({ signal }) => APIRequest.get('/me/emails').signal(signal).execute<ContactListResponse>(),
  });

export function useEmailsQuery(): UseQueryResult<ContactListResponse, ApiError> {
  return useQuery(emailsQueryOptions());
}

export function useAddEmailMutation(): UseMutationResult<AddContactResult, ApiError, string> {
  return useMutation<AddContactResult, ApiError, string>({
    mutationFn: email => APIRequest.post('/me/emails').body({ email }).execute<AddContactResult>(),
  });
}

export function useVerifyEmailMutation(): UseMutationResult<undefined, ApiError, VerifyContactInput> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, VerifyContactInput>({
    mutationFn: input => APIRequest.post('/me/emails/verify').body(input).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

export function useSetPrimaryEmailMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: email => APIRequest.post('/me/emails/primary').body({ email }).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

export function useRemoveEmailMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: email => APIRequest.delete('/me/emails').body({ email }).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

/** ---------- phones ---------- */

export const phonesQueryOptions = () =>
  queryOptions<ContactListResponse, ApiError>({
    queryKey: contactKeys.phones,
    queryFn: ({ signal }) => APIRequest.get('/me/phones').signal(signal).execute<ContactListResponse>(),
  });

export function usePhonesQuery(): UseQueryResult<ContactListResponse, ApiError> {
  return useQuery(phonesQueryOptions());
}

export function useAddPhoneMutation(): UseMutationResult<AddContactResult, ApiError, string> {
  return useMutation<AddContactResult, ApiError, string>({
    mutationFn: phone => APIRequest.post('/me/phones').body({ phone }).execute<AddContactResult>(),
  });
}

export function useVerifyPhoneMutation(): UseMutationResult<undefined, ApiError, VerifyContactInput> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, VerifyContactInput>({
    mutationFn: input => APIRequest.post('/me/phones/verify').body(input).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}

export function useSetPrimaryPhoneMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: phone => APIRequest.post('/me/phones/primary').body({ phone }).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}

export function useRemovePhoneMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: phone => APIRequest.delete('/me/phones').body({ phone }).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}
