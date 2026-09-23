/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { identityDb } from './db';
import { identityMutate } from './identity-auth';

/**
 * Defining types
 */

export type WebhookDeliveryStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'DEAD';

export interface WebhookOptions {
  /** Readable tag inside the generated subscription name. */
  label?: string;
  /** Defaults to a hostname that resolves to a private address, so a dispatch is refused instead of leaving the cluster. */
  targetUrl?: string;
  /** Defaults to an action name nothing ever writes, so the subscription is never enqueued against. */
  eventTypes?: string[];
}

export interface WebhookItem {
  readonly id: string;
  readonly name: string;
  readonly targetUrl: string;
  readonly eventTypes: string[];
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface WebhookSubscription extends WebhookItem {
  /** Returned by the create call alone; the detail and list views never carry it. */
  readonly secret: string;
}

export interface WebhookPatch {
  name?: string;
  targetUrl?: string;
  eventTypes?: string[];
  isActive?: boolean;
}

export interface WebhookDeliveryItem {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly status: WebhookDeliveryStatus;
  readonly attemptCount: number;
  readonly lastError?: string;
  readonly responseStatus?: number;
  readonly sentAt?: string;
}

export interface WebhookDeliveryRow {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly status: WebhookDeliveryStatus;
  readonly attemptCount: number;
  readonly lastError: string | null;
  /** Milliseconds until the worker may claim the row again; negative once it is due. */
  readonly dueInMs: number;
}

/**
 * Declaring the constants
 *
 * Admin-side webhook management, plus the delivery reads and the `next_attempt_at` fast-forward a retry-ladder spec needs
 * between the worker's five-second ticks. Delivery targets stay inside identity's SSRF guard: nothing a spec registers is
 * ever fetched, so no receiver has to exist.
 */

const ADMIN_PATH = '/api/v1/admin/webhooks';

/** Syntactically acceptable (a public-looking hostname) but resolves to a private address, so the delivery-time guard refuses it. */
export const PRIVATE_RESOLVING_TARGET = 'https://10-0-0-8.nip.io/e2e-webhook';

/** The `last_error` a target the guard refuses is recorded with — the message of identity's `WHK_002`. */
export const GUARD_REFUSAL_ERROR = 'Webhook target must be a public https url';

export class IdentityWebhookError extends Error {
  override readonly name = 'IdentityWebhookError';
}

export function registerWebhook(admin: APIRequestContext, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(admin, 'post', ADMIN_PATH, body);
}

export async function createWebhook(admin: APIRequestContext, options: WebhookOptions = {}): Promise<WebhookSubscription> {
  const tag = `${options.label ?? 'hook'}-${randomBytes(4).toString('hex')}`;
  const body = {
    name: `e2e-${tag}`,
    targetUrl: options.targetUrl ?? PRIVATE_RESOLVING_TARGET,
    eventTypes: options.eventTypes ?? [`e2e.never.${tag}`],
  };
  const response = await registerWebhook(admin, body);
  if (response.status() !== 201) throw new IdentityWebhookError(`registering ${body.name} answered ${response.status()}: ${await response.text()}`);
  const created = (await response.json()) as { webhook: WebhookItem; secret: string };
  return { ...created.webhook, secret: created.secret };
}

export function getWebhook(admin: APIRequestContext, webhookId: string): Promise<APIResponse> {
  return admin.get(`${ADMIN_PATH}/${webhookId}`);
}

export function listWebhooks(caller: APIRequestContext): Promise<APIResponse> {
  return caller.get(ADMIN_PATH);
}

export function patchWebhook(admin: APIRequestContext, webhookId: string, patch: WebhookPatch): Promise<APIResponse> {
  return identityMutate(admin, 'patch', `${ADMIN_PATH}/${webhookId}`, patch);
}

export function removeWebhook(admin: APIRequestContext, webhookId: string): Promise<APIResponse> {
  return identityMutate(admin, 'delete', `${ADMIN_PATH}/${webhookId}`);
}

export function rotateWebhookSecret(admin: APIRequestContext, webhookId: string): Promise<APIResponse> {
  return identityMutate(admin, 'post', `${ADMIN_PATH}/${webhookId}/rotate-secret`);
}

export function redeliverWebhookDelivery(admin: APIRequestContext, webhookId: string, deliveryId: string): Promise<APIResponse> {
  return identityMutate(admin, 'post', `${ADMIN_PATH}/${webhookId}/deliveries/${deliveryId}/redeliver`);
}

export async function listWebhookDeliveries(admin: APIRequestContext, webhookId: string, status?: WebhookDeliveryStatus): Promise<WebhookDeliveryItem[]> {
  const query = status ? `?${new URLSearchParams({ status }).toString()}` : '';
  const response = await admin.get(`${ADMIN_PATH}/${webhookId}/deliveries${query}`);
  if (response.status() !== 200) throw new IdentityWebhookError(`listing deliveries of ${webhookId} answered ${response.status()}: ${await response.text()}`);
  return ((await response.json()) as { items: WebhookDeliveryItem[] }).items;
}

export async function readWebhookDeliveries(webhookId: string): Promise<WebhookDeliveryRow[]> {
  return identityDb()<WebhookDeliveryRow[]>`
    SELECT id::text, event_id::text AS "eventId", event_type AS "eventType", status, attempt_count AS "attemptCount", last_error AS "lastError",
           (EXTRACT(EPOCH FROM (next_attempt_at - now())) * 1000)::int AS "dueInMs"
    FROM webhook_deliveries WHERE subscription_id = ${webhookId} ORDER BY id
  `;
}

/**
 * Puts a delivery `attemptCount` failures into the ladder and makes it due now, so the next worker tick runs the attempt
 * after it instead of the test waiting out a backoff measured in minutes.
 */
export async function setWebhookDeliveryAttempts(deliveryId: string, attemptCount: number): Promise<void> {
  await identityDb()`UPDATE webhook_deliveries SET attempt_count = ${attemptCount}, next_attempt_at = now() WHERE id = ${deliveryId}`;
}

export async function fastForwardWebhookDelivery(deliveryId: string): Promise<void> {
  await identityDb()`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE id = ${deliveryId}`;
}

/** Removes the subscription a spec registered — its deliveries cascade — whether or not the spec already deleted it through the API. */
export async function deleteWebhookRecord(webhookId: string): Promise<void> {
  await identityDb()`DELETE FROM webhook_subscriptions WHERE id = ${webhookId}`;
}
