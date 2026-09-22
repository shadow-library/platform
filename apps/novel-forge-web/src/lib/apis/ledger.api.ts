import { type QueryClient, queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type CreateLedgerEntryBody, type LedgerEntryResponse, type ListActiveQueryParams, type ListLedgerEntriesResponse } from './api-types.gen';
import { invalidateSoon } from './batched-invalidation';
import { invalidateProjectStatus } from './project.api';
import { ApiError, APIRequest } from './transport';

/**
 * The decision ledger — the Notebook. The list endpoint answers with active entries only; a topic's
 * history carries the superseded and withdrawn ones too, so the two are separate cache entries rather
 * than one filtered client-side.
 */
const ledgerKeys = {
  all: (projectId: string) => ['projects', projectId, 'ledger'] as const,
  list: (projectId: string, params?: ListActiveQueryParams) => [...ledgerKeys.all(projectId), 'list', params] as const,
  topic: (projectId: string, topic: string) => [...ledgerKeys.all(projectId), 'topics', topic] as const,
};

export const ledgerEntriesQueryOptions = (projectId: string, params?: ListActiveQueryParams): UseQueryOptions<ListLedgerEntriesResponse, ApiError> =>
  queryOptions<ListLedgerEntriesResponse, ApiError>({
    queryKey: ledgerKeys.list(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/ledger`)
        .query(params ?? {})
        .execute(),
  });

export const ledgerTopicQueryOptions = (projectId: string, topic: string): UseQueryOptions<ListLedgerEntriesResponse, ApiError> =>
  queryOptions<ListLedgerEntriesResponse, ApiError>({
    queryKey: ledgerKeys.topic(projectId, topic),
    queryFn: () => APIRequest.get(`/projects/${projectId}/ledger/topics/${encodeURIComponent(topic)}`).execute(),
  });

export function useLedgerEntriesQuery(projectId: string, params?: ListActiveQueryParams, enabled = true): UseQueryResult<ListLedgerEntriesResponse, ApiError> {
  return useQuery({ ...ledgerEntriesQueryOptions(projectId, params), enabled: enabled && Boolean(projectId) });
}

export function useLedgerTopicQuery(projectId: string, topic: string, enabled = true): UseQueryResult<ListLedgerEntriesResponse, ApiError> {
  return useQuery({ ...ledgerTopicQueryOptions(projectId, topic), enabled: enabled && Boolean(projectId) && Boolean(topic) });
}

export function useCreateLedgerEntryMutation(projectId: string): UseMutationResult<LedgerEntryResponse, ApiError, CreateLedgerEntryBody> {
  const queryClient = useQueryClient();
  return useMutation<LedgerEntryResponse, ApiError, CreateLedgerEntryBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/ledger`).body(body).execute(),
    onSuccess: () => invalidateLedger(queryClient, projectId),
  });
}

export interface WithdrawLedgerEntryInput {
  entryId: string;
  reason: string;
}

export function useWithdrawLedgerEntryMutation(projectId: string): UseMutationResult<LedgerEntryResponse, ApiError, WithdrawLedgerEntryInput> {
  const queryClient = useQueryClient();
  return useMutation<LedgerEntryResponse, ApiError, WithdrawLedgerEntryInput>({
    mutationFn: ({ entryId, reason }) => APIRequest.post(`/projects/${projectId}/ledger/${entryId}/withdraw`).body({ reason }).execute(),
    // Retiring a decision can un-complete the phase that counted it, so the stage the shell renders has to refetch too.
    onSuccess: () => {
      invalidateLedger(queryClient, projectId);
      invalidateProjectStatus(queryClient, projectId);
    },
  });
}

export function invalidateLedger(queryClient: QueryClient, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: ledgerKeys.all(projectId) });
}
