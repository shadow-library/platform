/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';

import { type APIRequestContext, type APIResponse, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { clientIpHeaders } from './client-ip';
import { identityDb } from './db';
import { type ProductKey, requireProductUrl } from './env';
import { identityMutate } from './identity-auth';
import { type OAuthClientCredentials, TOKEN_EXCHANGE_GRANT } from './identity-oauth';
import { deleteRoleAssignmentsFor, findApplicationIdByName, PLATFORM_APPLICATION_NAME } from './identity-roles';
import { type IdentitySession, identityStorageState } from './identity-sessions';
import { redisGet } from './redis';

/**
 * Defining types
 */

export type BotGrantLevel = 'read' | 'write';

export type BotStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETING' | 'DELETED';

export interface BotGrant {
  applicationId: number;
  /** Resource the application declares the grant under, e.g. `members` for identity's own bot roles. */
  resource: string;
  level: BotGrantLevel;
}

export interface CreateBotOptions {
  /** Readable tag embedded in the generated handle. */
  label?: string;
  displayName?: string;
  /** CIDRs the bot's key may be presented from; an empty allowlist accepts any address. */
  ipAllowlist?: string[];
}

export interface OrganisationBot {
  readonly botId: string;
  readonly clientId: string;
  readonly handle: string;
  readonly organisationId: string;
}

export interface IssueBotKeyOptions {
  name?: string;
  /** Default one hour ahead, so a key that outlives a failed teardown still expires on its own. */
  expiresAt?: Date;
}

export interface BotKey {
  readonly keyId: string;
  /** The `sl_bot_…` secret, handed back by the issuing call alone. */
  readonly key: string;
}

export interface SeedBotsOptions {
  /** Readable tag embedded in each generated handle. */
  label?: string;
  /** Default `ACTIVE`. A `DELETED` bot is a tombstone: it keeps its handle reserved but counts towards nothing. */
  status?: BotStatus;
  /** Recorded as `created_by`, as an administrator's creation would. */
  createdBy?: string;
}

export interface BotRow {
  readonly id: string;
  readonly clientId: string;
  readonly handle: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly status: BotStatus;
  readonly ipAllowlist: string[];
  readonly rateLimitPerMinute: number;
  readonly suspendedAt: Date | null;
  readonly suspendedBy: string | null;
  /** The tombstone stamp; set only once the worker has finished the deletion. */
  readonly deletedAt: Date | null;
}

export interface BotClientRow {
  readonly applicationId: number;
  readonly name: string;
  readonly kind: string;
  readonly isFirstParty: boolean;
  readonly grantTypes: string[];
  readonly organisationId: string | null;
  readonly isActive: boolean;
  readonly secretCount: number;
}

export interface BotKeyRow {
  readonly id: string;
  readonly botId: string;
  readonly keyPrefix: string;
  readonly secretHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
  /** Stored as `inet`, so a bare address comes back as a single-host range. */
  readonly lastUsedIp: string | null;
}

export type BotTransferStatus = 'PENDING' | 'DONE' | 'FAILED';

export interface BotTransferRow {
  readonly applicationId: number;
  readonly toUserId: string;
  readonly status: BotTransferStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly nextAttemptAt: Date;
  readonly completedAt: Date | null;
}

export interface BotTransferPatch {
  status?: BotTransferStatus;
  attempts?: number;
  lastError?: string | null;
  nextAttemptAt?: Date;
}

export interface BotKeyExchangeRequest {
  /** The `sl_bot_…` key presented as the RFC 8693 subject token; omitted entirely when absent. */
  subjectToken?: string;
  /** Default the bot-key type; `null` omits the parameter. */
  subjectTokenType?: string | null;
  /** Address the exchanging service says the key came from, checked against the bot's allowlist. */
  clientIp?: string;
  resource?: string;
  scope?: string;
  requestedTokenType?: string;
  actorToken?: string;
}

export interface BotKeyPatch {
  expiresAt?: Date;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  revokedAt?: Date | null;
}

export interface BotKeyParts {
  readonly encodedKeyId: string;
  readonly secret: string;
  readonly checksum: string;
}

export interface RoleBotGrant {
  resource: string;
  level: BotGrantLevel;
  sensitive?: boolean;
}

/**
 * Declaring the constants
 *
 * Organisation bots as an org admin creates them: the bot, the permission grants it may hold and one key, plus a
 * caller that presents nothing but `Authorization: Bearer sl_bot_…`. Every mutation needs an elevated OWNER or
 * ADMIN session, and identity's own `identity:org:*` roles are held by organisation rank, so a team owner may
 * grant them without any role assignment of their own. A bot's OAuth client is `ON DELETE restrict`, and its
 * service-account role assignments hang off the client id rather than the bot, so neither goes with the
 * organisation — `deleteOrganisationBotRecord` removes all three.
 */

const KEY_LIFETIME_MS = 60 * 60 * 1000;

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** RFC 8693 subject-token type identity accepts a bot key under. */
export const BOT_KEY_TOKEN_TYPE = 'urn:shadow:token-type:bot-key';

/** Fixed lifetime of the access token a key exchange issues — `BOT_ACCESS_TOKEN_TTL_SECONDS` in the server's `bot.constants.ts`, deliberately not policy-driven. */
export const BOT_ACCESS_TOKEN_TTL_SECONDS = 300;

/** Rate-limiter buckets a bot spends: one keyed on the key being exchanged, one on the bot making direct calls. */
export const BOT_KEY_EXCHANGE_BUCKET = 'bot-key-exchange';
export const BOT_API_BUCKET = 'bot-api';

/** Exchanges one key may make in a minute, before the bot's own `rateLimitPerMinute` is consulted — `BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE` in the server's `bot.constants.ts`. */
export const BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE = 60;

/** Attempts a handover gets before the worker stops retrying it and an administrator has to. */
export const MAX_BOT_TRANSFER_ATTEMPTS = 10;

/** `sl_bot_<22-char key id>_<43-char secret>_<6-char checksum>` — identity's own key shape. */
const BOT_KEY_PATTERN = /^sl_bot_([0-9A-Za-z]{22})_([0-9A-Za-z]{43})_([0-9A-Za-z]{6})$/;

export class IdentityBotError extends Error {
  override readonly name = 'IdentityBotError';
}

async function expectStatus(response: APIResponse, status: number, action: string): Promise<void> {
  if (response.status() !== status) throw new IdentityBotError(`${action} answered ${response.status()}: ${await response.text()}`);
}

export async function createOrganisationBot(orgAdmin: APIRequestContext, organisationId: string, options: CreateBotOptions = {}): Promise<OrganisationBot> {
  const handle = `e2e-${options.label ?? 'bot'}-${randomBytes(3).toString('hex')}`;
  const created = await identityMutate(orgAdmin, 'post', `/api/v1/organisations/${organisationId}/bots`, {
    handle,
    displayName: options.displayName ?? 'E2E Bot',
    ...(options.ipAllowlist ? { ipAllowlist: options.ipAllowlist } : {}),
  });
  await expectStatus(created, 201, `create bot ${handle}`);
  const body = (await created.json()) as { id: string; clientId: string };
  return { botId: body.id, clientId: body.clientId, handle, organisationId };
}

/** Replaces the bot's whole managed grant set; the granting admin must hold every permission behind it. */
export async function replaceBotPermissions(orgAdmin: APIRequestContext, bot: OrganisationBot, grants: BotGrant[]): Promise<void> {
  const response = await identityMutate(orgAdmin, 'put', `/api/v1/organisations/${bot.organisationId}/bots/${bot.botId}/permissions`, { grants });
  await expectStatus(response, 200, `grant permissions to ${bot.handle}`);
}

export async function issueBotKey(orgAdmin: APIRequestContext, bot: OrganisationBot, options: IssueBotKeyOptions = {}): Promise<BotKey> {
  const expiresAt = (options.expiresAt ?? new Date(Date.now() + KEY_LIFETIME_MS)).toISOString();
  const issued = await identityMutate(orgAdmin, 'post', `/api/v1/organisations/${bot.organisationId}/bots/${bot.botId}/keys`, { name: options.name ?? 'e2e-runner', expiresAt });
  await expectStatus(issued, 201, `issue a key for ${bot.handle}`);
  const body = (await issued.json()) as { id: string; key: string };
  return { keyId: body.id, key: body.key };
}

/** Suspends the bot, the state its key exchange and every policy decision for it are refused in. */
export async function suspendOrganisationBot(orgAdmin: APIRequestContext, bot: OrganisationBot): Promise<void> {
  const response = await identityMutate(orgAdmin, 'post', `/api/v1/organisations/${bot.organisationId}/bots/${bot.botId}/suspend`);
  await expectStatus(response, 200, `suspend ${bot.handle}`);
}

export async function resumeOrganisationBot(orgAdmin: APIRequestContext, bot: OrganisationBot): Promise<void> {
  const response = await identityMutate(orgAdmin, 'post', `/api/v1/organisations/${bot.organisationId}/bots/${bot.botId}/resume`);
  await expectStatus(response, 200, `resume ${bot.handle}`);
}

export interface BotApiOptions {
  /** A user session carried alongside the bot key, to prove the guard admits the bot on its own and attaches no session. */
  session?: IdentitySession;
  /** Default `identity`. Any first-party product accepts the same key: it exchanges it for a bot token behind the request. */
  product?: ProductKey;
}

/** A caller authenticated by a bot key, charged to `clientIp`. */
export function botApi(key: string, clientIp: string, options: BotApiOptions = {}): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: requireProductUrl(options.product ?? 'identity'),
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { ...clientIpHeaders(clientIp), authorization: `Bearer ${key}` },
    ...(options.session ? { storageState: identityStorageState(options.session) } : {}),
  });
}

/** Removes the bot, its OAuth client and the role assignments its service account holds. Idempotent. */
export async function deleteOrganisationBotRecord(bot: Pick<OrganisationBot, 'botId' | 'clientId'>): Promise<void> {
  const sql = identityDb();
  await sql`DELETE FROM bots WHERE id = ${bot.botId}`;
  await deleteRoleAssignmentsFor({ type: 'SERVICE_ACCOUNT', id: bot.clientId });
  await sql`DELETE FROM oauth_clients WHERE id = ${bot.clientId}`;
}

function botClientId(): string {
  return `bot_${Array.from(randomBytes(22), byte => BASE62[byte % 62]).join('')}`;
}

/**
 * Inserts `count` bots with their backing platform clients straight into the database — the only affordable way to
 * stand an organisation next to its 25-bot limit, or to put more than ten bot clients on the platform application.
 * The rows carry what `BotService.createBot` writes; `deleteOrganisationBotRecord` removes each one.
 */
export async function seedOrganisationBots(organisationId: string, count: number, options: SeedBotsOptions = {}): Promise<OrganisationBot[]> {
  if (count === 0) return [];
  const sql = identityDb();
  const applicationId = await findApplicationIdByName(PLATFORM_APPLICATION_NAME);
  const clientIds = Array.from({ length: count }, () => botClientId());
  const handles = Array.from({ length: count }, () => `e2e-${options.label ?? 'seed'}-${randomBytes(4).toString('hex')}`);

  return sql.begin(async tx => {
    await tx`
      INSERT INTO oauth_clients (id, application_id, name, kind, is_first_party, token_endpoint_auth_method, grant_types, access_token_ttl, organisation_id)
      SELECT seeded.client_id, ${applicationId}, seeded.handle || '[bot]', 'SERVICE', false, 'client_secret_basic', '{}'::text[], 300, ${organisationId}
      FROM unnest(${clientIds}::text[], ${handles}::text[]) AS seeded(client_id, handle)
    `;
    const rows = await tx<{ botId: string; clientId: string; handle: string }[]>`
      INSERT INTO bots (organisation_id, client_id, handle, display_name, status, created_by)
      SELECT ${organisationId}, seeded.client_id, seeded.handle, 'E2E Seeded Bot', ${options.status ?? 'ACTIVE'}::bot_status, ${options.createdBy ?? null}
      FROM unnest(${clientIds}::text[], ${handles}::text[]) AS seeded(client_id, handle)
      RETURNING id::text AS "botId", client_id AS "clientId", handle
    `;
    return rows.map(row => ({ ...row, organisationId }));
  });
}

/** Puts the bot into a status no API reaches from outside — `DELETING` without a handover, or the `DELETED` tombstone. */
export async function setOrganisationBotStatus(botId: string, status: BotStatus): Promise<void> {
  await identityDb()`UPDATE bots SET status = ${status}::bot_status, updated_at = now() WHERE id = ${botId}`;
}

export async function readOrganisationBot(botId: string): Promise<BotRow | undefined> {
  const [row] = await identityDb()<BotRow[]>`
    SELECT id::text, client_id AS "clientId", handle, display_name AS "displayName", description, status, ip_allowlist::text[] AS "ipAllowlist",
           rate_limit_per_minute AS "rateLimitPerMinute", suspended_at AS "suspendedAt", suspended_by::text AS "suspendedBy", deleted_at AS "deletedAt"
    FROM bots WHERE id = ${botId}
  `;
  return row;
}

/** The OAuth client behind a bot, with the number of secrets issued for it — a bot client is never given one. */
export async function readBotClient(clientId: string): Promise<BotClientRow | undefined> {
  const [row] = await identityDb()<BotClientRow[]>`
    SELECT c.application_id AS "applicationId", c.name, c.kind::text, c.is_first_party AS "isFirstParty", c.grant_types AS "grantTypes",
           c.organisation_id::text AS "organisationId", c.is_active AS "isActive",
           (SELECT count(*)::int FROM oauth_client_secrets s WHERE s.client_id = c.id) AS "secretCount"
    FROM oauth_clients c WHERE c.id = ${clientId}
  `;
  return row;
}

export async function readBotKeyRecord(keyId: string): Promise<BotKeyRow | undefined> {
  const [row] = await identityDb()<BotKeyRow[]>`
    SELECT id::text, bot_id::text AS "botId", key_prefix AS "keyPrefix", secret_hash AS "secretHash", expires_at AS "expiresAt", revoked_at AS "revokedAt",
           last_used_at AS "lastUsedAt", last_used_ip::text AS "lastUsedIp"
    FROM bot_keys WHERE id = ${keyId}
  `;
  return row;
}

/**
 * An RFC 8693 exchange of a bot key by `client`, which authenticates itself as on any other token-endpoint call.
 * Only a first-party client may forward `clientIp`; without it identity checks the connection address instead.
 */
export function exchangeBotKey(ctx: APIRequestContext, client: OAuthClientCredentials, input: BotKeyExchangeRequest): Promise<APIResponse> {
  const subjectTokenType = input.subjectTokenType === undefined ? BOT_KEY_TOKEN_TYPE : input.subjectTokenType;
  const form: Record<string, string> = {
    grant_type: TOKEN_EXCHANGE_GRANT,
    client_id: client.clientId,
    ...(client.secret ? { client_secret: client.secret } : {}),
  };
  if (input.subjectToken !== undefined) form.subject_token = input.subjectToken;
  if (subjectTokenType !== null) form.subject_token_type = subjectTokenType;
  if (input.clientIp !== undefined) form.client_ip = input.clientIp;
  if (input.resource !== undefined) form.resource = input.resource;
  if (input.scope !== undefined) form.scope = input.scope;
  if (input.requestedTokenType !== undefined) form.requested_token_type = input.requestedTokenType;
  if (input.actorToken !== undefined) form.actor_token = input.actorToken;
  return ctx.post('/oauth2/token', { form });
}

/** The handovers queued for a bot, ordered by application, as the worker and the deletion detail read them. */
export async function readBotTransfers(botId: string): Promise<BotTransferRow[]> {
  return identityDb()<BotTransferRow[]>`
    SELECT application_id AS "applicationId", to_user_id::text AS "toUserId", status, attempts, last_error AS "lastError",
           next_attempt_at AS "nextAttemptAt", completed_at AS "completedAt"
    FROM bot_ownership_transfers WHERE bot_id = ${botId} ORDER BY application_id
  `;
}

/** Rewrites the bot's handovers, or the one to `applicationId` — the exhausted state a worker would take six hours of retries to reach. */
export async function updateBotTransfers(botId: string, patch: BotTransferPatch, applicationId?: number): Promise<void> {
  const sql = identityDb();
  const fields = { status: patch.status, attempts: patch.attempts, last_error: patch.lastError, next_attempt_at: patch.nextAttemptAt };
  const columns = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (columns.length === 0) return;
  await sql`
    UPDATE bot_ownership_transfers SET ${sql(Object.fromEntries(columns))}, updated_at = now()
    WHERE bot_id = ${botId} AND (${applicationId ?? null}::int IS NULL OR application_id = ${applicationId ?? null})
  `;
}

/** Queues a handover the deletion API would only enqueue for a bot-aware application, so any application can stand in for one. */
export async function insertBotTransfer(botId: string, applicationId: number, toUserId: string): Promise<void> {
  await identityDb()`INSERT INTO bot_ownership_transfers (bot_id, application_id, to_user_id) VALUES (${botId}, ${applicationId}, ${toUserId})`;
}

/** Releases the applications and recipients a handover holds by `ON DELETE restrict`; deleting the bot itself cascades them. */
export async function deleteBotTransfers(botId: string, applicationId?: number): Promise<void> {
  await identityDb()`
    DELETE FROM bot_ownership_transfers WHERE bot_id = ${botId} AND (${applicationId ?? null}::int IS NULL OR application_id = ${applicationId ?? null})
  `;
}

/** Rewrites a key's lifecycle columns — an expiry in the past, or the use identity would have stamped on it. */
export async function updateBotKeyRecord(keyId: string, patch: BotKeyPatch): Promise<void> {
  const sql = identityDb();
  const fields = { expires_at: patch.expiresAt, last_used_at: patch.lastUsedAt, last_used_ip: patch.lastUsedIp, revoked_at: patch.revokedAt };
  const columns = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (columns.length === 0) return;
  await sql`UPDATE bot_keys SET ${sql(Object.fromEntries(columns))} WHERE id = ${keyId}`;
}

/** Sets or clears a role's bot-grant columns; the catalog sync refuses a grantable role holding no permission, and this does not. */
export async function setRoleBotGrant(roleId: number, grant: RoleBotGrant | null): Promise<void> {
  await identityDb()`
    UPDATE application_roles
    SET bot_grantable = ${grant !== null}, bot_resource = ${grant?.resource ?? null}, bot_level = ${grant?.level ?? null}, is_sensitive = ${grant?.sensitive ?? false}
    WHERE id = ${roleId}
  `;
}

/** The counter every decision for the bot's service account folds in; a permission change bumps it so cached decisions lapse. */
export async function readBotAuthzVersion(clientId: string): Promise<number> {
  return Number((await redisGet(`authz_version:SERVICE_ACCOUNT:${clientId}`)) ?? 0);
}

export function parseBotKeyParts(key: string): BotKeyParts | null {
  const match = BOT_KEY_PATTERN.exec(key);
  if (!match) return null;
  const [, encodedKeyId = '', secret = '', checksum = ''] = match;
  return { encodedKeyId, secret, checksum };
}

/** What identity stores for a key: the SHA-256 of its secret segment alone, never of the whole key. */
export function botKeySecretHash(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function encodeBase62(value: bigint, length: number): string {
  let encoded = '';
  for (let remaining = value; remaining > 0n; remaining /= 62n) encoded = BASE62[Number(remaining % 62n)] + encoded;
  return encoded.padStart(length, '0');
}

/** Only the leading character moves, so the segment stays base62 and inside the 128-bit id / 256-bit secret ranges identity checks. */
function alterSegment(segment: string): string {
  return `${segment.startsWith('0') ? '1' : '0'}${segment.slice(1)}`;
}

/**
 * The key with a different id, or its own id and a different secret — well formed down to the crc32 checksum, so only the
 * lookup can refuse them. A key mangled without recomputing the checksum never reaches the lookup at all.
 */
export function forgeBotKey(key: string, part: 'keyId' | 'secret'): string {
  const parts = parseBotKeyParts(key);
  if (!parts) throw new IdentityBotError(`${key.slice(0, 16)}… is not a bot key`);
  const encodedKeyId = part === 'keyId' ? alterSegment(parts.encodedKeyId) : parts.encodedKeyId;
  const secret = part === 'secret' ? alterSegment(parts.secret) : parts.secret;
  const body = `sl_bot_${encodedKeyId}_${secret}`;
  return `${body}_${encodeBase62(BigInt(crc32(Buffer.from(body, 'utf8'))), 6)}`;
}
