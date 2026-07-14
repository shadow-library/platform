/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type AddContactResponse, type ContactItemDto, type ContactListResponse } from './api-types.gen';
import { serverFetch } from './server-fetch';

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

const fetchEmails = createServerFn({ method: 'GET' }).handler(() => serverFetch<ContactListResponse>({ method: 'GET', path: '/me/emails' }));
const addEmail = createServerFn({ method: 'POST' })
  .validator((email: string) => email)
  .handler(({ data }) => serverFetch<AddContactResult>({ method: 'POST', path: '/me/emails', body: { email: data } }));
const verifyEmail = createServerFn({ method: 'POST' })
  .validator((input: VerifyContactInput) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/me/emails/verify', body: data }));
const setPrimaryEmail = createServerFn({ method: 'POST' })
  .validator((email: string) => email)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/me/emails/primary', body: { email: data } }));
const removeEmail = createServerFn({ method: 'POST' })
  .validator((email: string) => email)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: '/me/emails', body: { email: data } }));

export const emailsQueryOptions = () => queryOptions<ContactListResponse, ApiError>({ queryKey: contactKeys.emails, queryFn: () => call(fetchEmails()) });

export function useEmailsQuery(): UseQueryResult<ContactListResponse, ApiError> {
  return useQuery(emailsQueryOptions());
}

export function useAddEmailMutation(): UseMutationResult<AddContactResult, ApiError, string> {
  return useMutation<AddContactResult, ApiError, string>({ mutationFn: email => call(addEmail({ data: email })) });
}

export function useVerifyEmailMutation(): UseMutationResult<undefined, ApiError, VerifyContactInput> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, VerifyContactInput>({
    mutationFn: input => call(verifyEmail({ data: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

export function useSetPrimaryEmailMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: email => call(setPrimaryEmail({ data: email })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

export function useRemoveEmailMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: email => call(removeEmail({ data: email })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.emails }),
  });
}

/* ---------- phones ---------- */

const fetchPhones = createServerFn({ method: 'GET' }).handler(() => serverFetch<ContactListResponse>({ method: 'GET', path: '/me/phones' }));
const addPhone = createServerFn({ method: 'POST' })
  .validator((phone: string) => phone)
  .handler(({ data }) => serverFetch<AddContactResult>({ method: 'POST', path: '/me/phones', body: { phone: data } }));
const verifyPhone = createServerFn({ method: 'POST' })
  .validator((input: VerifyContactInput) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/me/phones/verify', body: data }));
const setPrimaryPhone = createServerFn({ method: 'POST' })
  .validator((phone: string) => phone)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/me/phones/primary', body: { phone: data } }));
const removePhone = createServerFn({ method: 'POST' })
  .validator((phone: string) => phone)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: '/me/phones', body: { phone: data } }));

export const phonesQueryOptions = () => queryOptions<ContactListResponse, ApiError>({ queryKey: contactKeys.phones, queryFn: () => call(fetchPhones()) });

export function usePhonesQuery(): UseQueryResult<ContactListResponse, ApiError> {
  return useQuery(phonesQueryOptions());
}

export function useAddPhoneMutation(): UseMutationResult<AddContactResult, ApiError, string> {
  return useMutation<AddContactResult, ApiError, string>({ mutationFn: phone => call(addPhone({ data: phone })) });
}

export function useVerifyPhoneMutation(): UseMutationResult<undefined, ApiError, VerifyContactInput> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, VerifyContactInput>({
    mutationFn: input => call(verifyPhone({ data: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}

export function useSetPrimaryPhoneMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: phone => call(setPrimaryPhone({ data: phone })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}

export function useRemovePhoneMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: phone => call(removePhone({ data: phone })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactKeys.phones }),
  });
}
