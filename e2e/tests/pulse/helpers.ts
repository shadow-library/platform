/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

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

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH';

export type NotificationJobStatus = 'PENDING' | 'PROCESSING' | 'FAILED' | 'SENT' | 'PERMANENTLY_FAILED';

export interface NotificationJobRow {
  templateId: string;
  templateVersionId: string;
  channel: NotificationChannel;
  recipient: string;
  status: NotificationJobStatus;
  /** Default `en-ZZ`, the locale the baseline catalogue publishes. */
  locale?: string;
  /** Default now. The dashboard buckets a job by this, so a past date lands it in an earlier trend day. */
  createdAt?: Date;
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

/**
 * A wall-clock literal for pulse's naive `timestamp` columns. A `Date` would be sent with this host's offset and
 * stored with it dropped, landing the row in the wrong day whenever the host is not on UTC — which is exactly the
 * bucket `DashboardService` reads.
 */
function utcTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/** A collision-safe resource key: `e2e-<concern>-<epoch-ms><random>` — two copies of one test can start in the same millisecond. */
export function uniqueKey(concern: string): string {
  return `e2e-${concern}-${Date.now()}${randomBytes(3).toString('hex')}`;
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

/**
 * A template of the caller's own with one published `en-ZZ` EMAIL body, and the row id of that published version —
 * everything a `notification_jobs` row needs to point at, with no dependency on the baseline catalogue.
 */
export async function createPublishedTemplate(ctx: APIRequestContext, concern: string): Promise<{ id: string; templateKey: string; versionId: string }> {
  const created = await createTemplate(ctx, { templateKey: uniqueKey(concern), messageType: 'TRANSACTIONAL' });
  await mutate(ctx, 'put', `/api/v1/templates/${created.id}/channels/EMAIL`, { data: { isEnabled: true } });
  await openDraft(ctx, created.id);
  await putDraftContent(ctx, created.id, { channel: 'EMAIL', locale: 'en-ZZ', subject: 'E2E', body: 'E2E body' });
  const published = await publishDraft(ctx, created.id, 'e2e publish');
  if (published.status() !== 200) throw new Error(`publishing ${created.templateKey} failed: ${published.status()} ${await published.text()}`);
  return { ...created, versionId: await findPublishedVersionId(created.id) };
}

/**
 * The id of `templateId`'s currently `PUBLISHED` version — `notification_jobs.template_version_id` is NOT NULL and
 * no API surfaces a version's row id (`VersionResponse` carries the version *number*).
 */
export async function findPublishedVersionId(templateId: string): Promise<string> {
  const rows = await pulseDb()<{ id: string }[]>`
    SELECT id::text FROM template_versions WHERE template_id = ${templateId} AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error(`template ${templateId} has no PUBLISHED version`);
  return row.id;
}

/**
 * Writes the `notification_jobs` row a queued delivery produces and returns its id.
 *
 * Every send path into pulse is `@RequireScope('notifications:send')`, a service-only scope no host-side caller can
 * hold (see `security.spec.ts`), so a delivery state is arranged by writing the row the queue would have written.
 */
export async function insertNotificationJob(row: NotificationJobRow): Promise<string> {
  const createdAt = utcTimestamp(row.createdAt ?? new Date());
  const rows = await pulseDb()<{ id: string }[]>`
    INSERT INTO notification_jobs (template_id, template_version_id, channel, locale, recipient, status, created_at, updated_at)
    VALUES (
      ${row.templateId}, ${row.templateVersionId}, ${row.channel}::notification_channel, ${row.locale ?? 'en-ZZ'}, ${row.recipient},
      ${row.status}::notification_status, ${createdAt}, ${createdAt}
    )
    RETURNING id::text
  `;
  const inserted = rows[0];
  if (!inserted) throw new Error(`notification_jobs insert for ${row.recipient} returned no row`);
  return inserted.id;
}

/** Writes the `notification_messages` row `DevNotificationProvider` writes — the only place rendered content ever lands. */
export async function insertNotificationMessage(jobId: string, content: { renderedBody: string; renderedSubject?: string }): Promise<string> {
  const rows = await pulseDb()<{ id: string }[]>`
    INSERT INTO notification_messages (notification_job_id, rendered_subject, rendered_body)
    VALUES (${jobId}, ${content.renderedSubject ?? null}, ${content.renderedBody})
    RETURNING id::text
  `;
  const inserted = rows[0];
  if (!inserted) throw new Error(`notification_messages insert for job ${jobId} returned no row`);
  return inserted.id;
}

/** Removes `jobIds` and the messages hanging off them; safe to call with ids that are already gone. */
export async function deleteNotificationJobs(jobIds: readonly string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const sql = pulseDb();
  const ids = sql(jobIds as string[]);
  await sql`DELETE FROM notification_messages WHERE notification_job_id IN ${ids}`;
  await sql`DELETE FROM notification_jobs WHERE id IN ${ids}`;
}
