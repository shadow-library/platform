/**
 * Importing npm packages
 */
import { useMutation, type UseMutationOptions, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from '@shadow-library/web';

/**
 * Importing user defined packages/modules
 */
import {
  type CreateRoutingRuleBody,
  type ListSenderRoutingRuleResponse,
  type ListSenderRoutingRulesQueryParams,
  type SenderRoutingRuleDetailResponse,
  type SenderRoutingRuleResponse,
  type UpdateSenderRoutingRuleBody,
} from './api-types.gen';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const senderRoutingRuleKeys = {
  all: ['sender-routing-rules'],
  lists: () => [...senderRoutingRuleKeys.all, 'list'],
  list: (params?: ListSenderRoutingRulesQueryParams) => [...senderRoutingRuleKeys.lists(), params],
  detail: (routingRuleId: string) => [...senderRoutingRuleKeys.all, routingRuleId],
} as const;

export function useListSenderRoutingRulesQuery(params: ListSenderRoutingRulesQueryParams = {}): UseQueryResult<ListSenderRoutingRuleResponse, ApiError> {
  return useQuery<ListSenderRoutingRuleResponse, ApiError>({
    queryKey: senderRoutingRuleKeys.list(params),
    queryFn: ({ signal }) => APIRequest.get('/api/v1/sender-routing-rules').query(params).signal(signal).execute(),
  });
}

export function useSenderRoutingRuleQuery(routingRuleId: string): UseQueryResult<SenderRoutingRuleDetailResponse, ApiError> {
  return useQuery<SenderRoutingRuleDetailResponse, ApiError>({
    queryKey: senderRoutingRuleKeys.detail(routingRuleId),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/sender-routing-rules/${routingRuleId}`).signal(signal).execute(),
  });
}

export function useCreateSenderRoutingRuleMutation(): UseMutationResult<SenderRoutingRuleResponse, ApiError, CreateRoutingRuleBody> {
  const queryClient = useQueryClient();
  return useMutation<SenderRoutingRuleResponse, ApiError, CreateRoutingRuleBody>({
    mutationFn: data => APIRequest.post('/api/v1/sender-routing-rules').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: senderRoutingRuleKeys.lists() }),
  });
}

export function useUpdateSenderRoutingRuleMutation(routingRuleId: string): UseMutationResult<SenderRoutingRuleResponse, ApiError, UpdateSenderRoutingRuleBody> {
  const queryClient = useQueryClient();
  return useMutation<SenderRoutingRuleResponse, ApiError, UpdateSenderRoutingRuleBody>({
    mutationFn: data => APIRequest.patch(`/api/v1/sender-routing-rules/${routingRuleId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: senderRoutingRuleKeys.detail(routingRuleId) });
      queryClient.invalidateQueries({ queryKey: senderRoutingRuleKeys.lists() });
    },
  });
}

export function useDeleteSenderRoutingRuleMutation(routingRuleId: string): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<void, ApiError, void> = {
    mutationFn: () => APIRequest.delete(`/api/v1/sender-routing-rules/${routingRuleId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: senderRoutingRuleKeys.lists() }),
  };
  return useMutation(options);
}
