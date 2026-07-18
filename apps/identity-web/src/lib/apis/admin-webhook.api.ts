/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import {
  type CreatedWebhookResponse,
  type CreateWebhookBody,
  type UpdateWebhookBody,
  type WebhookDeliveriesResponse,
  type WebhookDeliveryItem,
  type WebhookItem,
  type WebhookListResponse,
} from './api-types.gen';
import { serverFetch } from './server-fetch';

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

/* ---------- server functions ---------- */

const fetchWebhooks = createServerFn({ method: 'GET' }).handler(() => serverFetch<WebhookListResponse>({ method: 'GET', path: '/admin/webhooks' }));
const fetchWebhook = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => serverFetch<WebhookItem>({ method: 'GET', path: `/admin/webhooks/${data}` }));
const fetchWebhookDeliveries = createServerFn({ method: 'GET' })
  .validator((input: { id: string; status?: DeliveryStatus }) => input)
  .handler(({ data }) => serverFetch<WebhookDeliveriesResponse>({ method: 'GET', path: `/admin/webhooks/${data.id}/deliveries`, query: { status: data.status } }));
const createWebhook = createServerFn({ method: 'POST' })
  .validator((body: CreateWebhookBody) => body)
  .handler(({ data }) => serverFetch<CreatedWebhookResponse>({ method: 'POST', path: '/admin/webhooks', body: data }));
const updateWebhook = createServerFn({ method: 'POST' })
  .validator((input: { id: string; body: UpdateWebhookBody }) => input)
  .handler(({ data }) => serverFetch<WebhookItem>({ method: 'PATCH', path: `/admin/webhooks/${data.id}`, body: data.body }));
const rotateWebhookSecret = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(({ data }) => serverFetch<{ secret: string }>({ method: 'POST', path: `/admin/webhooks/${data}/rotate-secret`, body: {} }));
const deleteWebhook = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/admin/webhooks/${data}` }));
const redeliverWebhook = createServerFn({ method: 'POST' })
  .validator((input: { webhookId: string; deliveryId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: `/admin/webhooks/${data.webhookId}/deliveries/${data.deliveryId}/redeliver`, body: {} }));

/* ---------- queries ---------- */

export const webhooksQueryOptions = () => queryOptions<WebhookListResponse, ApiError>({ queryKey: adminWebhookKeys.all, queryFn: () => call(fetchWebhooks()) });

export function useWebhooksQuery(): UseQueryResult<WebhookListResponse, ApiError> {
  return useQuery(webhooksQueryOptions());
}

export const webhookQueryOptions = (id: string, enabled = true) =>
  queryOptions<WebhookItem, ApiError>({
    queryKey: adminWebhookKeys.detail(id),
    queryFn: () => call(fetchWebhook({ data: id })),
    enabled: enabled && Boolean(id),
  });

export function useWebhookQuery(id: string, enabled = true): UseQueryResult<WebhookItem, ApiError> {
  return useQuery(webhookQueryOptions(id, enabled));
}

export const webhookDeliveriesQueryOptions = (id: string, status?: DeliveryStatus, enabled = true) =>
  queryOptions<WebhookDeliveriesResponse, ApiError>({
    queryKey: adminWebhookKeys.deliveries(id, status),
    queryFn: () => call(fetchWebhookDeliveries({ data: { id, status } })),
    enabled: enabled && Boolean(id),
  });

export function useWebhookDeliveriesQuery(id: string, status?: DeliveryStatus, enabled = true): UseQueryResult<WebhookDeliveriesResponse, ApiError> {
  return useQuery(webhookDeliveriesQueryOptions(id, status, enabled));
}

/* ---------- mutations ---------- */

export function useCreateWebhookMutation(): UseMutationResult<CreatedWebhookResponse, ApiError, CreateWebhookBody> {
  const queryClient = useQueryClient();
  return useMutation<CreatedWebhookResponse, ApiError, CreateWebhookBody>({
    mutationFn: body => call(createWebhook({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all }),
  });
}

export function useUpdateWebhookMutation(): UseMutationResult<WebhookItem, ApiError, { id: string; body: UpdateWebhookBody }> {
  const queryClient = useQueryClient();
  return useMutation<WebhookItem, ApiError, { id: string; body: UpdateWebhookBody }>({
    mutationFn: input => call(updateWebhook({ data: input })),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all });
      queryClient.invalidateQueries({ queryKey: adminWebhookKeys.detail(id) });
    },
  });
}

export function useRotateWebhookSecretMutation(): UseMutationResult<{ secret: string }, ApiError, string> {
  return useMutation<{ secret: string }, ApiError, string>({ mutationFn: id => call(rotateWebhookSecret({ data: id })) });
}

export function useDeleteWebhookMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: id => call(deleteWebhook({ data: id })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminWebhookKeys.all }),
  });
}

export function useRedeliverWebhookMutation(): UseMutationResult<undefined, ApiError, { webhookId: string; deliveryId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { webhookId: string; deliveryId: string }>({
    mutationFn: input => call(redeliverWebhook({ data: input })),
    onSuccess: (_data, { webhookId }) => queryClient.invalidateQueries({ queryKey: [...adminWebhookKeys.all, webhookId, 'deliveries'] }),
  });
}
