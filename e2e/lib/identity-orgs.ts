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
import { OAUTH_REDIRECT_URI, type OAuthTestClient } from './identity-oauth';
import { redisCommand } from './redis';

/**
 * Defining types
 */

export type AppAccessMode = 'ALL_APPS' | 'ASSIGNED_ONLY';

export type OrganisationStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type OrganisationRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';

export type OrgOAuthAppKind = 'WEB_CONFIDENTIAL' | 'SPA_PUBLIC' | 'NATIVE_PUBLIC';

export interface TeamOrganisationOptions {
  /** Readable tag embedded in the name and slug. */
  label?: string;
  /** Default `ALL_APPS`, identity's own default. */
  appAccessMode?: AppAccessMode;
}

export interface TeamOrganisation {
  readonly organisationId: string;
  readonly slug: string;
  readonly name: string;
}

export interface MembershipOptions {
  /** Default `MEMBER`. */
  role?: OrganisationRole;
  /** Default `ACTIVE`. */
  status?: MembershipStatus;
  /** When a suspension lapses; a past value makes a `SUSPENDED` membership count as active again. */
  statusUntil?: Date | null;
  isDefault?: boolean;
}

export interface OrganisationPatch {
  status?: OrganisationStatus;
  appAccessMode?: AppAccessMode;
}

export interface RegisterOrgOAuthAppOptions {
  /** Default `WEB_CONFIDENTIAL`. */
  kind?: OrgOAuthAppKind;
  displayName?: string;
  /** Grants the refresh_token grant. */
  offlineAccess?: boolean;
}

export interface OrgOAuthApp extends OAuthTestClient {
  readonly organisationId: string;
}

/**
 * Declaring the constants
 *
 * Team organisations and their application access. Organisations and memberships are written straight to the database, like
 * the user factory, because every state a scenario needs (a suspended membership, a suspended organisation, a SCIM-managed
 * account) is otherwise reachable only through flows this suite does not drive. Identity caches each organisation's grant set
 * in Redis under a version key; membership, organisation-status and SCIM rows are read live, and the helpers that change what
 * the cached set is computed from bump that key, as identity's own mutation paths do. Application assignment and org-owned
 * OAuth apps go through the API, which needs an org admin whose session is self-service elevated.
 */

export const PLATFORM_ORGANISATION_NAME = 'Shadow Platform';

export class IdentityOrgError extends Error {
  override readonly name = 'IdentityOrgError';
}

async function expectStatus(response: APIResponse, status: number, action: string): Promise<void> {
  if (response.status() !== status) throw new IdentityOrgError(`${action} answered ${response.status()}: ${await response.text()}`);
}

/** Drops identity's cached grant set for the organisation. */
export async function invalidateOrganisationGrants(organisationId: string): Promise<void> {
  await redisCommand('INCR', `app_access_version:org:${organisationId}`);
}

/** Drops every organisation's cached grant set, as an application-wide change in identity does. */
export async function invalidateAllGrants(): Promise<void> {
  await redisCommand('INCR', 'app_access_version:global');
}

/** The bootstrap-created platform organisation, whose members alone reach INTERNAL applications. */
export async function findPlatformOrganisationId(): Promise<string> {
  const [row] = await identityDb()<{ id: string }[]>`SELECT id::text FROM organisations WHERE type = 'TEAM' AND name = ${PLATFORM_ORGANISATION_NAME} ORDER BY id LIMIT 1`;
  if (!row) throw new IdentityOrgError(`no ${PLATFORM_ORGANISATION_NAME} organisation; run identity's bootstrap first`);
  return row.id;
}

export async function createTeamOrganisation(options: TeamOrganisationOptions = {}): Promise<TeamOrganisation> {
  const suffix = `${options.label ?? 'team'}-${randomBytes(4).toString('hex')}`;
  const slug = `e2e-${suffix}`;
  const name = `E2E ${suffix}`;
  const [row] = await identityDb()<{ id: string }[]>`
    INSERT INTO organisations (slug, name, type, status, app_access_mode)
    VALUES (${slug}, ${name}, 'TEAM', 'ACTIVE', ${options.appAccessMode ?? 'ALL_APPS'}::organisation_app_access_mode)
    RETURNING id::text
  `;
  if (!row) throw new IdentityOrgError(`organisation insert for ${slug} returned no row`);
  return { organisationId: row.id, slug, name };
}

/** Removes the organisation; memberships, releases, assignments and SCIM rows cascade. Org-owned applications must be deleted first. */
export async function deleteOrganisation(organisationId: string): Promise<void> {
  await identityDb()`DELETE FROM organisations WHERE id = ${organisationId}`;
}

export async function updateOrganisation(organisationId: string, patch: OrganisationPatch): Promise<void> {
  const sql = identityDb();
  const fields = { status: patch.status, app_access_mode: patch.appAccessMode };
  const columns = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (columns.length === 0) return;
  await sql`UPDATE organisations SET ${sql(Object.fromEntries(columns))} WHERE id = ${organisationId}`;
  await invalidateOrganisationGrants(organisationId);
}

export async function addOrganisationMember(organisationId: string, userId: string, options: MembershipOptions = {}): Promise<void> {
  const status = options.status ?? 'ACTIVE';
  await identityDb()`
    INSERT INTO organisation_members (organisation_id, user_id, role, status, status_until, status_changed_at, is_default)
    VALUES (
      ${organisationId}, ${userId}, ${options.role ?? 'MEMBER'}::organisation_member_role, ${status}::organisation_member_status, ${options.statusUntil ?? null},
      ${status === 'ACTIVE' ? null : new Date()}, ${options.isDefault ?? false}
    )
  `;
}

export async function updateOrganisationMember(organisationId: string, userId: string, patch: Pick<MembershipOptions, 'status' | 'statusUntil'>): Promise<void> {
  const sql = identityDb();
  const fields = { status: patch.status, status_until: patch.statusUntil, status_changed_at: new Date() };
  const columns = Object.entries(fields).filter(([, value]) => value !== undefined);
  await sql`UPDATE organisation_members SET ${sql(Object.fromEntries(columns))} WHERE organisation_id = ${organisationId} AND user_id = ${userId}`;
}

/** Records the user in the organisation's SCIM directory; `managed` fences the account to that organisation's grants. */
export async function setScimDirectoryEntry(organisationId: string, userId: string, managed: boolean): Promise<void> {
  await identityDb()`
    INSERT INTO scim_directory (organisation_id, user_id, user_name, managed)
    VALUES (${organisationId}, ${userId}, ${`e2e-scim-${userId}`}, ${managed})
    ON CONFLICT (organisation_id, user_id) DO UPDATE SET managed = EXCLUDED.managed, updated_at = now()
  `;
}

export async function listOwnedApplicationIds(organisationId: string): Promise<number[]> {
  const rows = await identityDb()<{ id: number }[]>`SELECT id FROM applications WHERE owner_organisation_id = ${organisationId} ORDER BY id`;
  return rows.map(row => row.id);
}

/** Assigns an application to the organisation; `orgAdmin` must be an elevated OWNER or ADMIN of it. */
export async function assignOrganisationApplication(orgAdmin: APIRequestContext, organisationId: string, applicationId: number): Promise<void> {
  await expectStatus(
    await identityMutate(orgAdmin, 'post', `/api/v1/organisations/${organisationId}/applications`, { applicationId: String(applicationId) }),
    200,
    `assign ${applicationId}`,
  );
}

export async function unassignOrganisationApplication(orgAdmin: APIRequestContext, organisationId: string, applicationId: number): Promise<void> {
  const response = await identityMutate(orgAdmin, 'delete', `/api/v1/organisations/${organisationId}/applications/${applicationId}`);
  await expectStatus(response, 200, `unassign ${applicationId}`);
}

/** Registers an org-owned (RESTRICTED, third-party) OAuth app redirecting to `OAUTH_REDIRECT_URI`. */
export async function registerOrgOAuthApp(orgAdmin: APIRequestContext, organisationId: string, options: RegisterOrgOAuthAppOptions = {}): Promise<OrgOAuthApp> {
  const registered = await identityMutate(orgAdmin, 'post', `/api/v1/organisations/${organisationId}/oauth-apps`, {
    displayName: options.displayName ?? `E2E Org App ${randomBytes(3).toString('hex')}`,
    kind: options.kind ?? 'WEB_CONFIDENTIAL',
    redirectUris: [OAUTH_REDIRECT_URI],
    ...(options.offlineAccess ? { offlineAccess: true } : {}),
  });
  await expectStatus(registered, 201, 'register org oauth app');
  const body = (await registered.json()) as { applicationId: number; clientId: string; clientSecret?: string };
  return { organisationId, applicationId: body.applicationId, clientId: body.clientId, secret: body.clientSecret, redirectUri: OAUTH_REDIRECT_URI };
}

/** Deletes an org-owned app with its client; one already gone is fine. */
export async function deleteOrgOAuthApp(orgAdmin: APIRequestContext, organisationId: string, applicationId: number): Promise<void> {
  const response = await identityMutate(orgAdmin, 'delete', `/api/v1/organisations/${organisationId}/oauth-apps/${applicationId}`);
  if (response.status() !== 404) await expectStatus(response, 200, `delete org oauth app ${applicationId}`);
}
