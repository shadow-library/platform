/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import {
  type CreateWebhookBody,
  type CreatedWebhookResponse,
  type UpdateWebhookBody,
  type WebhookDeliveriesResponse,
  type WebhookDeliveryItem,
  type WebhookItem,
  type WebhookListResponse,
} from './api-types.gen';

/**
 * Defining types
 */

export type { CreateWebhookBody, CreatedWebhookResponse, UpdateWebhookBody, WebhookDeliveriesResponse, WebhookDeliveryItem, WebhookItem, WebhookListResponse };
export type DeliveryStatus = WebhookDeliveryItem['status'];

/**
 * Declaring the constants
 */
export const adminWebhookKeys = {
  all: ['admin', 'webhooks'] as const,
  detail: (id: string) => [...adminWebhookKeys.all, id] as const,
  deliveries: (id: string, status?: DeliveryStatus) => [...adminWebhookKeys.all, id, 'deliveries', status] as const,
};

export function useWebhooksQuery(): UseQueryResult<WebhookListResponse, ApiError> {
  return useQuery<WebhookListResponse, ApiError>({ queryKey: adminWebhookKeys.all, queryFn: () => APIRequest.get('/admin/webhooks').execute() });
}

export function useWebhookQuery(id: string, enabled = true): UseQueryResult<WebhookItem, ApiError> {
  return useQuery<WebhookItem, ApiError>({
    queryKey: adminWebhookKeys.detail(id),
    queryFn: () => APIRequest.get(`/admin/webhooks/${id}`).execute(),
    enabled: enabled && Boolean(id),
  });
}

export function useWebhookDeliveriesQuery(id: string, status?: DeliveryStatus, enabled = true): UseQueryResult<WebhookDeliveriesResponse, ApiError> {
  return useQuery<WebhookDeliveriesResponse, ApiError>({
    queryKey: adminWebhookKeys.deliveries(id, status),
    queryFn: () => APIRequest.get(`/admin/webhooks/${id}/deliveries`).query({ status }).execute(),
    enabled: enabled && Boolean(id),
  });
}

export function useCreateWebhookMutation(): UseMutationResult<CreatedWebhookResponse, ApiError, CreateWebhookBody> {
  const queryClient = useQueryClient();
  return useMutation<CreatedWebhookResponse, ApiError, CreateWebhookBody>({
    mutationFn: body => APIRequest.post('/admin/webhooks').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all }),
  });
}

export function useUpdateWebhookMutation(): UseMutationResult<WebhookItem, ApiError, { id: string; body: UpdateWebhookBody }> {
  const queryClient = useQueryClient();
  return useMutation<WebhookItem, ApiError, { id: string; body: UpdateWebhookBody }>({
    mutationFn: ({ id, body }) => APIRequest.patch(`/admin/webhooks/${id}`).body(body).execute(),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all });
      queryClient.invalidateQueries({ queryKey: adminWebhookKeys.detail(id) });
    },
  });
}

export function useRotateWebhookSecretMutation(): UseMutationResult<{ secret: string }, ApiError, string> {
  return useMutation<{ secret: string }, ApiError, string>({ mutationFn: id => APIRequest.post(`/admin/webhooks/${id}/rotate-secret`).body({}).execute() });
}

export function useDeleteWebhookMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: id => APIRequest.delete(`/admin/webhooks/${id}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all }),
  });
}

export function useRedeliverWebhookMutation(): UseMutationResult<undefined, ApiError, { webhookId: string; deliveryId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { webhookId: string; deliveryId: string }>({
    mutationFn: ({ webhookId, deliveryId }) => APIRequest.post(`/admin/webhooks/${webhookId}/deliveries/${deliveryId}/redeliver`).body({}).execute(),
    onSuccess: (_data, { webhookId }) => queryClient.invalidateQueries({ queryKey: [...adminWebhookKeys.all, webhookId, 'deliveries'] }),
  });
}
