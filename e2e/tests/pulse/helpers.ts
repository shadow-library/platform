/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, pulseDb } from '../../lib';

/**
 * Defining types
 */

export interface TemplateOverrides {
  templateKey: string;
  name?: string;
  messageType?: 'OTP' | 'TRANSACTIONAL' | 'PROMOTIONAL';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  category?: string;
  description?: string;
  variableSchema?: { variables: Record<string, { type: 'string' | 'number' | 'boolean'; required: boolean; description?: string; example?: string }> };
  isActive?: boolean;
}

export interface SenderProfileOverrides {
  key: string;
  displayName?: string;
  isActive?: boolean;
}

export interface SenderEndpointOverrides {
  channel: 'EMAIL' | 'SMS' | 'PUSH';
  provider: 'DEV' | 'SENDGRID' | 'TWILIO' | 'FIREBASE' | 'AWS_SES';
  identifier: string;
  weight?: number;
  isActive?: boolean;
}

export interface RoutingRuleOverrides {
  senderProfileId: string;
  service?: string;
  region?: string;
  messageType?: 'OTP' | 'TRANSACTIONAL' | 'PROMOTIONAL';
}

/**
 * Declaring the constants
 *
 * Shared setup/teardown for the pulse spec suite. Every helper here creates or cleans up an
 * `e2e-`-prefixed resource the calling spec owns outright — nothing touches the seeded `e2e-dev` sender
 * profile/endpoints/routing rule or the baseline `auth.*` template catalog. `mutate` (from `../../lib`)
 * already handles the CSRF double-submit dance for the admin-authenticated `APIRequestContext` every spec
 * builds via `apiContext('pulse', 'admin')`.
 */

/** A collision-safe resource key: `e2e-<concern>-<epoch-ms>`, unique enough for a suite run without a central counter. */
export function uniqueKey(concern: string): string {
  return `e2e-${concern}-${Date.now()}`;
}

/** Creates a template via `POST /api/v1/templates` and returns the parsed 201 body (or throws with the raw body on failure). */
export async function createTemplate(ctx: APIRequestContext, overrides: TemplateOverrides): Promise<{ id: string; templateKey: string }> {
  const response = await mutate(ctx, 'post', '/api/v1/templates', {
    data: { name: overrides.templateKey, messageType: 'TRANSACTIONAL', priority: 'MEDIUM', ...overrides },
  });
  if (response.status() !== 201) throw new Error(`createTemplate(${overrides.templateKey}) failed: ${response.status()} ${await response.text()}`);
  return response.json();
}

/** Best-effort cleanup: templates have no DELETE route, so the isolation contract is satisfied by deactivating instead. */
export async function deactivateTemplate(ctx: APIRequestContext, templateId: string): Promise<void> {
  await mutate(ctx, 'patch', `/api/v1/templates/${templateId}`, { data: { isActive: false } });
}

/** Opens (or re-fetches, idempotently) the draft version for `templateId`. */
export async function openDraft(ctx: APIRequestContext, templateId: string): Promise<APIResponse> {
  return mutate(ctx, 'post', `/api/v1/templates/${templateId}/versions/draft`);
}

/** Writes one channel/locale content block onto the open draft. */
export async function putDraftContent(
  ctx: APIRequestContext,
  templateId: string,
  content: { channel: 'EMAIL' | 'SMS' | 'PUSH'; locale?: string; subject?: string; body: string },
): Promise<APIResponse> {
  return mutate(ctx, 'put', `/api/v1/templates/${templateId}/versions/draft/contents`, { data: content });
}

/** Publishes the open draft. */
export async function publishDraft(ctx: APIRequestContext, templateId: string, notes?: string): Promise<APIResponse> {
  return mutate(ctx, 'post', `/api/v1/templates/${templateId}/versions/draft/publish`, { data: notes ? { notes } : {} });
}

/** Creates a sender profile via `POST /api/v1/sender-profiles`. */
export async function createSenderProfile(ctx: APIRequestContext, overrides: SenderProfileOverrides): Promise<{ id: string; key: string }> {
  const response = await mutate(ctx, 'post', '/api/v1/sender-profiles', { data: overrides });
  if (response.status() !== 201) throw new Error(`createSenderProfile(${overrides.key}) failed: ${response.status()} ${await response.text()}`);
  return response.json();
}

/** Deletes a sender profile (204 on success). Callers own ordering — a profile with live routing rules 409s (`SND_PRF_003`). */
export async function deleteSenderProfile(ctx: APIRequestContext, profileId: string): Promise<APIResponse> {
  return mutate(ctx, 'delete', `/api/v1/sender-profiles/${profileId}`);
}

/** Creates an endpoint under `profileId`. */
export async function createSenderEndpoint(ctx: APIRequestContext, profileId: string, overrides: SenderEndpointOverrides): Promise<APIResponse> {
  return mutate(ctx, 'post', `/api/v1/sender-profiles/${profileId}/endpoints`, { data: overrides });
}

/** Creates a routing rule. */
export async function createRoutingRule(ctx: APIRequestContext, overrides: RoutingRuleOverrides): Promise<APIResponse> {
  return mutate(ctx, 'post', '/api/v1/sender-routing-rules', { data: overrides });
}

/**
 * `POST/GET /api/v1/sender-routing-rules` never echoes the row's own id (`SenderRoutingRuleResponse` /
 * `SenderRoutingRuleDetailResponse` declare no `id` field — confirmed empirically against the deployed
 * API: `GET /api/v1/sender-routing-rules` returns only `{ senderProfileId, messageType, region, service,
 * createdAt, updatedAt }`), yet `PATCH`/`DELETE /api/v1/sender-routing-rules/:routingRuleId` require that
 * id. This is a suspected app bug (see the report); this helper is the DB-backed workaround every spec
 * needing a routing rule's id must use instead of the (nonexistent) API field.
 */
export async function findRoutingRuleId(senderProfileId: string, service?: string, region?: string, messageType?: string): Promise<string> {
  const rows = await pulseDb()<{ id: string }[]>`
    SELECT id FROM sender_routing_rules
    WHERE sender_profile_id = ${senderProfileId}
      AND service IS NOT DISTINCT FROM ${service ?? null}
      AND region IS NOT DISTINCT FROM ${region ?? null}
      AND message_type IS NOT DISTINCT FROM ${messageType ?? null}
    ORDER BY id DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error(`No sender_routing_rules row found for profile ${senderProfileId} (${service ?? 'null'}/${region ?? 'null'}/${messageType ?? 'null'})`);
  return row.id;
}

/** Deletes a routing rule by id. */
export async function deleteRoutingRule(ctx: APIRequestContext, routingRuleId: string): Promise<APIResponse> {
  return mutate(ctx, 'delete', `/api/v1/sender-routing-rules/${routingRuleId}`);
}
