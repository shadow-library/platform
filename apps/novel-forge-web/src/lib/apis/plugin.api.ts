import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type EnablePluginBody,
  type PluginAugmentResponse,
  type PluginManifestResponse,
  type PluginManifestResponse1,
  type ProjectPluginResponse,
  type ProjectPluginResponse1,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * The plugin host surface: the manifests this deployment loaded, and which of them a novel has enabled
 * with what settings. A deployment that loads none answers the manifest list with `[]`, which is what the
 * settings UI keys its whole Plugins surface off.
 */
export type PluginManifest = PluginManifestResponse1;
export type ProjectPlugin = ProjectPluginResponse1;

const pluginKeys = {
  manifests: () => ['plugins'] as const,
  enabled: (projectId: string) => ['projects', projectId, 'plugins'] as const,
};

export interface EnablePluginVariables extends EnablePluginBody {
  pluginId: string;
}

export function useListPluginsQuery(enabled = true): UseQueryResult<PluginManifestResponse, ApiError> {
  return useQuery<PluginManifestResponse, ApiError>({
    queryKey: pluginKeys.manifests(),
    queryFn: () => APIRequest.get('/plugins').execute(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectPluginsQuery(projectId: string, enabled = true): UseQueryResult<ProjectPluginResponse, ApiError> {
  return useQuery<ProjectPluginResponse, ApiError>({
    queryKey: pluginKeys.enabled(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/plugins`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

/** The request replaces the stored row, so `ordinal` has to ride along on every save or it resets to 0. */
export function useEnablePluginMutation(projectId: string): UseMutationResult<ProjectPlugin, ApiError, EnablePluginVariables> {
  const queryClient = useQueryClient();
  return useMutation<ProjectPlugin, ApiError, EnablePluginVariables>({
    mutationFn: ({ pluginId, ...body }) => APIRequest.put(`/projects/${projectId}/plugins/${pluginId}`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pluginKeys.enabled(projectId) }),
  });
}

export function useDisablePluginMutation(projectId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: pluginId => APIRequest.delete(`/projects/${projectId}/plugins/${pluginId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pluginKeys.enabled(projectId) }),
  });
}

/**
 * Answers 204 with an empty body when the plugin proposes nothing — a status the OpenAPI document does not
 * carry, so the generated types promise a response that is not always there. The transport resolves it as
 * `undefined`; callers must tell that apart from a staged proposal.
 */
export function useAugmentCanonMutation(projectId: string): UseMutationResult<PluginAugmentResponse | undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<PluginAugmentResponse | undefined, ApiError, string>({
    mutationFn: pluginId => APIRequest.post(`/projects/${projectId}/plugins/${pluginId}/augment`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}
