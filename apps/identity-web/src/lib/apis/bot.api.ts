import {
  type InfiniteData,
  queryOptions,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  type BotActivityDetailItem,
  type BotActivityItem,
  type BotActivityResponse,
  type BotCatalogApplicationItem,
  type BotCatalogLevelItem,
  type BotCatalogResourceItem,
  type BotDeletionItem,
  type BotGrantBody,
  type BotGrantItem,
  type BotItem,
  type BotKeyItem,
  type BotKeysResponse,
  type BotOwnedRecordItem,
  type BotOwnershipApplicationItem,
  type BotOwnershipResponse,
  type BotOwnershipTransferItem,
  type BotPermissionCatalogResponse,
  type BotPermissionsResponse,
  type BotsResponse,
  type BotTransferRecipientItem,
  type BotTransferRetryResponse,
  type BotUsageItem,
  type CreateBotBody,
  type CreateBotKeyBody,
  type CreatedBotKeyResponse,
  type DeleteBotBody,
  type ListActivityQueryParams,
  type OrganisationActionResponse,
  type ReplaceBotPermissionsBody,
  type UpdateBotBody,
} from './api-types.gen';
import { orgKeys } from './organisation.api';
import { type ApiError, APIRequest } from './transport';

export type {
  BotActivityDetailItem,
  BotActivityItem,
  BotActivityResponse,
  BotCatalogApplicationItem,
  BotCatalogLevelItem,
  BotCatalogResourceItem,
  BotDeletionItem,
  BotGrantBody,
  BotGrantItem,
  BotItem,
  BotKeyItem,
  BotKeysResponse,
  BotOwnedRecordItem,
  BotOwnershipApplicationItem,
  BotOwnershipResponse,
  BotOwnershipTransferItem,
  BotPermissionCatalogResponse,
  BotPermissionsResponse,
  BotsResponse,
  BotTransferRecipientItem,
  BotTransferRetryResponse,
  BotUsageItem,
  CreateBotBody,
  CreateBotKeyBody,
  CreatedBotKeyResponse,
  DeleteBotBody,
  ReplaceBotPermissionsBody,
  UpdateBotBody,
};
export type BotStatus = BotItem['status'];
export type BotKeyStatus = BotKeyItem['status'];
export type BotGrantLevel = BotGrantBody['level'];
export type BotActivityAction = NonNullable<ListActivityQueryParams['action']>;
export type BotActivityOutcome = NonNullable<ListActivityQueryParams['outcome']>;

/** Query params for `GET /organisations/:organisationId/bots/:botId/activity` — cursor-based pagination. */
export interface BotActivityParams {
  limit?: number;
  cursor?: string;
  action?: BotActivityAction;
  outcome?: BotActivityOutcome;
}

export const botKeys = {
  all: (orgId: string) => [...orgKeys.detail(orgId), 'bots'] as const,
  list: (orgId: string) => [...botKeys.all(orgId), 'list'] as const,
  detail: (orgId: string, botId: string) => [...botKeys.all(orgId), botId] as const,
  keys: (orgId: string, botId: string) => [...botKeys.detail(orgId, botId), 'keys'] as const,
  ownership: (orgId: string, botId: string) => [...botKeys.detail(orgId, botId), 'ownership'] as const,
  permissionCatalog: (orgId: string) => [...botKeys.all(orgId), 'permission-catalog'] as const,
  permissions: (orgId: string, botId: string) => [...botKeys.detail(orgId, botId), 'permissions'] as const,
  activity: (orgId: string, botId: string, filter: Omit<BotActivityParams, 'cursor'>) => [...botKeys.detail(orgId, botId), 'activity', filter] as const,
};

export const botsQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<BotsResponse, ApiError>({
    queryKey: botKeys.list(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/bots`).signal(signal).execute<BotsResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useBotsQuery(orgId: string, enabled = true): UseQueryResult<BotsResponse, ApiError> {
  return useQuery(botsQueryOptions(orgId, enabled));
}

export const botQueryOptions = (orgId: string, botId: string, enabled = true) =>
  queryOptions<BotItem, ApiError>({
    queryKey: botKeys.detail(orgId, botId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/bots/${botId}`).signal(signal).execute<BotItem>(),
    enabled: enabled && Boolean(orgId) && Boolean(botId),
  });

export function useBotQuery(orgId: string, botId: string, enabled = true): UseQueryResult<BotItem, ApiError> {
  return useQuery(botQueryOptions(orgId, botId, enabled));
}

export const botKeysQueryOptions = (orgId: string, botId: string, enabled = true) =>
  queryOptions<BotKeysResponse, ApiError>({
    queryKey: botKeys.keys(orgId, botId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/bots/${botId}/keys`).signal(signal).execute<BotKeysResponse>(),
    enabled: enabled && Boolean(orgId) && Boolean(botId),
  });

export function useBotKeysQuery(orgId: string, botId: string, enabled = true): UseQueryResult<BotKeysResponse, ApiError> {
  return useQuery(botKeysQueryOptions(orgId, botId, enabled));
}

export function useCreateBotMutation(orgId: string): UseMutationResult<BotItem, ApiError, CreateBotBody> {
  const queryClient = useQueryClient();
  return useMutation<BotItem, ApiError, CreateBotBody>({
    mutationFn: body => APIRequest.post(`/organisations/${orgId}/bots`).body(body).execute<BotItem>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) }),
  });
}

export function useUpdateBotMutation(orgId: string): UseMutationResult<OrganisationActionResponse, ApiError, { botId: string; body: UpdateBotBody }> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationActionResponse, ApiError, { botId: string; body: UpdateBotBody }>({
    mutationFn: ({ botId, body }) => APIRequest.patch(`/organisations/${orgId}/bots/${botId}`).body(body).execute<OrganisationActionResponse>(),
    onSuccess: (_, { botId }) => {
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) });
    },
  });
}

export function useSuspendBotMutation(orgId: string): UseMutationResult<OrganisationActionResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationActionResponse, ApiError, string>({
    mutationFn: botId => APIRequest.post(`/organisations/${orgId}/bots/${botId}/suspend`).body({}).execute<OrganisationActionResponse>(),
    onSuccess: (_, botId) => {
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) });
    },
  });
}

export function useResumeBotMutation(orgId: string): UseMutationResult<OrganisationActionResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationActionResponse, ApiError, string>({
    mutationFn: botId => APIRequest.post(`/organisations/${orgId}/bots/${botId}/resume`).body({}).execute<OrganisationActionResponse>(),
    onSuccess: (_, botId) => {
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) });
    },
  });
}

/** The fan-out is slow and degrades per application, so it is never part of a route loader's critical path. */
export const botOwnershipQueryOptions = (orgId: string, botId: string, enabled = true) =>
  queryOptions<BotOwnershipResponse, ApiError>({
    queryKey: botKeys.ownership(orgId, botId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/bots/${botId}/ownership`).signal(signal).execute<BotOwnershipResponse>(),
    enabled: enabled && Boolean(orgId) && Boolean(botId),
    staleTime: 0,
  });

export function useBotOwnershipQuery(orgId: string, botId: string, enabled = true): UseQueryResult<BotOwnershipResponse, ApiError> {
  return useQuery(botOwnershipQueryOptions(orgId, botId, enabled));
}

export function useDeleteBotMutation(orgId: string): UseMutationResult<OrganisationActionResponse, ApiError, { botId: string; body: DeleteBotBody }> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationActionResponse, ApiError, { botId: string; body: DeleteBotBody }>({
    mutationFn: ({ botId, body }) => APIRequest.delete(`/organisations/${orgId}/bots/${botId}`).body(body).execute<OrganisationActionResponse>(),
    onSuccess: (_, { botId }) => {
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.keys(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.ownership(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) });
    },
  });
}

export function useRetryBotTransfersMutation(orgId: string): UseMutationResult<BotTransferRetryResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<BotTransferRetryResponse, ApiError, string>({
    mutationFn: botId => APIRequest.post(`/organisations/${orgId}/bots/${botId}/ownership/retry`).body({}).execute<BotTransferRetryResponse>(),
    onSuccess: (_, botId) => {
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.ownership(orgId, botId) });
    },
  });
}

export function useCreateBotKeyMutation(orgId: string): UseMutationResult<CreatedBotKeyResponse, ApiError, { botId: string; body: CreateBotKeyBody }> {
  const queryClient = useQueryClient();
  return useMutation<CreatedBotKeyResponse, ApiError, { botId: string; body: CreateBotKeyBody }>({
    mutationFn: ({ botId, body }) => APIRequest.post(`/organisations/${orgId}/bots/${botId}/keys`).body(body).execute<CreatedBotKeyResponse>(),
    gcTime: 0,
    onSuccess: (_, { botId }) => {
      queryClient.invalidateQueries({ queryKey: botKeys.keys(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) });
    },
  });
}

export function useRevokeBotKeyMutation(orgId: string): UseMutationResult<OrganisationActionResponse, ApiError, { botId: string; keyId: string }> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationActionResponse, ApiError, { botId: string; keyId: string }>({
    mutationFn: ({ botId, keyId }) => APIRequest.delete(`/organisations/${orgId}/bots/${botId}/keys/${keyId}`).execute<OrganisationActionResponse>(),
    onSuccess: (_, { botId }) => {
      queryClient.invalidateQueries({ queryKey: botKeys.keys(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) });
    },
  });
}

export const botPermissionCatalogQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<BotPermissionCatalogResponse, ApiError>({
    queryKey: botKeys.permissionCatalog(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/bot-permission-catalog`).signal(signal).execute<BotPermissionCatalogResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useBotPermissionCatalogQuery(orgId: string, enabled = true): UseQueryResult<BotPermissionCatalogResponse, ApiError> {
  return useQuery(botPermissionCatalogQueryOptions(orgId, enabled));
}

export const botPermissionsQueryOptions = (orgId: string, botId: string, enabled = true) =>
  queryOptions<BotPermissionsResponse, ApiError>({
    queryKey: botKeys.permissions(orgId, botId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/bots/${botId}/permissions`).signal(signal).execute<BotPermissionsResponse>(),
    enabled: enabled && Boolean(orgId) && Boolean(botId),
  });

export function useBotPermissionsQuery(orgId: string, botId: string, enabled = true): UseQueryResult<BotPermissionsResponse, ApiError> {
  return useQuery(botPermissionsQueryOptions(orgId, botId, enabled));
}

export function useReplaceBotPermissionsMutation(orgId: string): UseMutationResult<OrganisationActionResponse, ApiError, { botId: string; grants: BotGrantBody[] }> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationActionResponse, ApiError, { botId: string; grants: BotGrantBody[] }>({
    mutationFn: ({ botId, grants }) =>
      APIRequest.put(`/organisations/${orgId}/bots/${botId}/permissions`)
        .body({ grants } satisfies ReplaceBotPermissionsBody)
        .execute<OrganisationActionResponse>(),
    onSuccess: (_, { botId }) => {
      queryClient.invalidateQueries({ queryKey: botKeys.permissions(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.detail(orgId, botId) });
      queryClient.invalidateQueries({ queryKey: botKeys.list(orgId) });
    },
  });
}

const ACTIVITY_PAGE_LIMIT = 25;

export const botActivityQueryOptions = (orgId: string, botId: string, filter: Omit<BotActivityParams, 'cursor'> = {}, enabled = true) =>
  queryOptions<BotActivityResponse, ApiError>({
    queryKey: botKeys.activity(orgId, botId, filter),
    queryFn: ({ signal }) =>
      APIRequest.get(`/organisations/${orgId}/bots/${botId}/activity`)
        .query({ limit: filter.limit ?? ACTIVITY_PAGE_LIMIT, action: filter.action, outcome: filter.outcome })
        .signal(signal)
        .execute<BotActivityResponse>(),
    enabled: enabled && Boolean(orgId) && Boolean(botId),
  });

export function useBotActivityQuery(orgId: string, botId: string, filter: Omit<BotActivityParams, 'cursor'> = {}, enabled = true): UseQueryResult<BotActivityResponse, ApiError> {
  return useQuery(botActivityQueryOptions(orgId, botId, filter, enabled));
}

export function useBotActivityInfiniteQuery(
  orgId: string,
  botId: string,
  filter: Omit<BotActivityParams, 'cursor'> = {},
  enabled = true,
): UseInfiniteQueryResult<InfiniteData<BotActivityResponse, string | undefined>, ApiError> {
  return useInfiniteQuery<BotActivityResponse, ApiError, InfiniteData<BotActivityResponse, string | undefined>, ReturnType<typeof botKeys.activity>, string | undefined>({
    queryKey: botKeys.activity(orgId, botId, filter),
    queryFn: ({ signal, pageParam }) =>
      APIRequest.get(`/organisations/${orgId}/bots/${botId}/activity`)
        .query({ limit: filter.limit ?? ACTIVITY_PAGE_LIMIT, action: filter.action, outcome: filter.outcome, cursor: pageParam })
        .signal(signal)
        .execute<BotActivityResponse>(),
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled: enabled && Boolean(orgId) && Boolean(botId),
  });
}
