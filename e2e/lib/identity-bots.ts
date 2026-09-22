/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { clientIpHeaders } from './client-ip';
import { identityDb } from './db';
import { requireProductUrl } from './env';
import { identityMutate } from './identity-auth';
import { deleteRoleAssignmentsFor } from './identity-roles';
import { type IdentitySession, identityStorageState } from './identity-sessions';

/**
 * Defining types
 */

export type BotGrantLevel = 'read' | 'write';

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

export interface BotApiOptions {
  /** A user session carried alongside the bot key, to prove the guard admits the bot on its own and attaches no session. */
  session?: IdentitySession;
}

/** An identity caller authenticated by a bot key, charged to `clientIp`. */
export function botApi(key: string, clientIp: string, options: BotApiOptions = {}): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: requireProductUrl('identity'),
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
