import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { type CreatedWebhookResponse, type CreateWebhookBody, type WebhookDeliveriesResponse, type WebhookDeliveryItem, type WebhookListResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type { CreateWebhookBody, CreatedWebhookResponse, WebhookDeliveriesResponse, WebhookDeliveryItem, WebhookListResponse };
export type DeliveryStatus = WebhookDeliveryItem['status'];

const adminWebhookKeys = {
  all: ['admin', 'webhooks'] as const,
  detail: (id: string) => [...adminWebhookKeys.all, id] as const,
  deliveries: (id: string, status?: DeliveryStatus) => [...adminWebhookKeys.all, id, 'deliveries', status] as const,
};

export const webhooksQueryOptions = () =>
  queryOptions<WebhookListResponse, ApiError>({
    queryKey: adminWebhookKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/webhooks').signal(signal).execute<WebhookListResponse>(),
  });

export function useWebhooksQuery(): UseQueryResult<WebhookListResponse, ApiError> {
  return useQuery(webhooksQueryOptions());
}

const webhookDeliveriesQueryOptions = (id: string, status?: DeliveryStatus, enabled = true) =>
  queryOptions<WebhookDeliveriesResponse, ApiError>({
    queryKey: adminWebhookKeys.deliveries(id, status),
    queryFn: ({ signal }) => APIRequest.get(`/admin/webhooks/${id}/deliveries`).query({ status }).signal(signal).execute<WebhookDeliveriesResponse>(),
    enabled: enabled && Boolean(id),
  });

export function useWebhookDeliveriesQuery(id: string, status?: DeliveryStatus, enabled = true): UseQueryResult<WebhookDeliveriesResponse, ApiError> {
  return useQuery(webhookDeliveriesQueryOptions(id, status, enabled));
}

export function useCreateWebhookMutation(): UseMutationResult<CreatedWebhookResponse, ApiError, CreateWebhookBody> {
  const queryClient = useQueryClient();
  return useMutation<CreatedWebhookResponse, ApiError, CreateWebhookBody>({
    mutationFn: body => APIRequest.post('/admin/webhooks').body(body).execute<CreatedWebhookResponse>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all }),
  });
}

export function useRotateWebhookSecretMutation(): UseMutationResult<{ secret: string }, ApiError, string> {
  return useMutation<{ secret: string }, ApiError, string>({
    mutationFn: id => APIRequest.post(`/admin/webhooks/${id}/rotate-secret`).body({}).execute<{ secret: string }>(),
  });
}

export function useDeleteWebhookMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: id => APIRequest.delete(`/admin/webhooks/${id}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all }),
  });
}

export function useRedeliverWebhookMutation(): UseMutationResult<undefined, ApiError, { webhookId: string; deliveryId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { webhookId: string; deliveryId: string }>({
    mutationFn: input => APIRequest.post(`/admin/webhooks/${input.webhookId}/deliveries/${input.deliveryId}/redeliver`).body({}).execute<undefined>(),
    onSuccess: (_data, { webhookId }) => queryClient.invalidateQueries({ queryKey: [...adminWebhookKeys.all, webhookId, 'deliveries'] }),
  });
}
