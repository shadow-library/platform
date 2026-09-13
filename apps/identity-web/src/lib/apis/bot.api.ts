import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type BotItem,
  type BotKeyItem,
  type BotKeysResponse,
  type BotsResponse,
  type BotUsageItem,
  type CreateBotBody,
  type CreateBotKeyBody,
  type CreatedBotKeyResponse,
  type OrganisationActionResponse,
  type UpdateBotBody,
} from './api-types.gen';
import { orgKeys } from './organisation.api';
import { type ApiError, APIRequest } from './transport';

export type { BotItem, BotKeyItem, BotKeysResponse, BotsResponse, BotUsageItem, CreateBotBody, CreateBotKeyBody, CreatedBotKeyResponse, UpdateBotBody };
export type BotStatus = BotItem['status'];
export type BotKeyStatus = BotKeyItem['status'];

export const botKeys = {
  all: (orgId: string) => [...orgKeys.detail(orgId), 'bots'] as const,
  list: (orgId: string) => [...botKeys.all(orgId), 'list'] as const,
  detail: (orgId: string, botId: string) => [...botKeys.all(orgId), botId] as const,
  keys: (orgId: string, botId: string) => [...botKeys.detail(orgId, botId), 'keys'] as const,
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
