/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { identityDb } from './db';
import { type BotGrantLevel } from './identity-bots';
import { findResourceScopeId, grantClientScope, type OAuthApplication, type OAuthClientCredentials, PLATFORM_AUDIENCE, serviceToken } from './identity-oauth';

/**
 * Defining types
 */

export type AuthzScope = 'authz:check' | 'authz:roles:sync';

export type AuthzPrincipalType = 'USER' | 'SERVICE_ACCOUNT';

export interface CatalogPermission {
  name: string;
  description?: string;
}

export interface CatalogBotGrant {
  resource: string;
  level: BotGrantLevel;
  sensitive?: boolean;
}

export interface CatalogRole {
  name: string;
  description?: string;
  /** Every name must also appear in the manifest's `permissions`. */
  permissions: string[];
  /** Resolved for every user of the application without an assignment. */
  default?: boolean;
  /** Makes the role grantable to organisation bots; omitting it on a later push resets all four bot columns. */
  bot?: CatalogBotGrant;
}

export interface CatalogManifest {
  permissions: CatalogPermission[];
  roles: CatalogRole[];
  /** Overrides the guardrail that refuses a manifest deleting more than half of the catalog. */
  force?: boolean;
}

export interface CatalogSyncResult {
  permissionsUpserted: number;
  permissionsDeleted: number;
  rolesUpserted: number;
  rolesDeleted: number;
  principalsInvalidated: number;
}

export interface AuthzCheck {
  principalType: AuthzPrincipalType;
  principalId: string;
  organisationId: string;
  action: string;
}

export interface AuthzDecision {
  decision: 'PERMIT' | 'DENY';
  reasons: string[];
  authzVersion: number;
}

export interface ServiceAccessRule {
  callerClientId: string;
  method: string;
  path: string;
}

export interface CatalogRoleRow {
  roleId: number;
  roleName: string;
  isDefault: boolean;
  botGrantable: boolean;
  botResource: string | null;
  botLevel: BotGrantLevel | null;
  isSensitive: boolean;
}

/** The three service-token endpoints an application's back end calls, as one bearer token reaches them. */
export interface AuthzCaller {
  check(request: AuthzCheck): Promise<APIResponse>;
  sync(manifest: CatalogManifest): Promise<APIResponse>;
  serviceAccess(): Promise<APIResponse>;
}

export interface AuthzApi extends AuthzCaller {
  readonly application: OAuthApplication;
  readonly clientId: string;
  /** `check`, throwing unless identity answers 200. */
  decide(request: AuthzCheck): Promise<AuthzDecision>;
  /** `sync`, throwing unless identity answers 200. */
  syncOrThrow(manifest: CatalogManifest): Promise<CatalogSyncResult>;
  /** The same client's rules, throwing unless identity answers 200. */
  rules(): Promise<ServiceAccessRule[]>;
  /** A caller for this client carrying only `scopes` — what the insufficient-scope refusals need. */
  scoped(...scopes: AuthzScope[]): Promise<AuthzCaller>;
}

/**
 * Declaring the constants
 *
 * Identity's policy decision point as an application's back end reaches it: a client-credentials token on the
 * application's own provisioned client, and the `check`, `catalog` and `service-access` calls that token opens.
 * Every decision is scoped to the application the calling client is bound to, so a scenario about cross-application
 * isolation needs two throwaway applications rather than two clients. Roles and permissions here are created through
 * the catalog API itself — the surface under test — while the database factories arrange only the assignments and
 * memberships a sync never writes.
 */

export const AUTHZ_SCOPES: readonly AuthzScope[] = ['authz:check', 'authz:roles:sync'];

export class AuthzKitError extends Error {
  override readonly name = 'AuthzKitError';
}

async function expectOk(response: APIResponse, action: string): Promise<unknown> {
  if (response.status() !== 200) throw new AuthzKitError(`${action} answered ${response.status()}: ${await response.text()}`);
  return response.json();
}

export function authzCaller(ctx: APIRequestContext, token: string): AuthzCaller {
  const headers = { authorization: `Bearer ${token}` };
  return {
    check: request => ctx.post('/api/v1/authz/check', { headers, data: request }),
    sync: manifest => ctx.put('/api/v1/authz/catalog', { headers, data: manifest }),
    serviceAccess: () => ctx.get('/api/v1/authz/service-access', { headers }),
  };
}

/** Grants `scopes` to `client` and returns a caller holding all of them. `ctx` should be cookie-less, as a back end's would be. */
export async function authzApiFor(
  admin: APIRequestContext,
  ctx: APIRequestContext,
  client: OAuthClientCredentials,
  scopes: readonly AuthzScope[] = AUTHZ_SCOPES,
): Promise<AuthzCaller> {
  for (const scope of scopes) await grantClientScope(admin, client.clientId, await findResourceScopeId(admin, PLATFORM_AUDIENCE, scope));
  return authzCaller(ctx, await serviceToken(ctx, client, { scope: scopes.join(' ') }));
}

/** The application's own provisioned client as its policy-decision caller, holding `authz:check` and `authz:roles:sync`. */
export async function createAuthzApi(admin: APIRequestContext, ctx: APIRequestContext, application: OAuthApplication): Promise<AuthzApi> {
  const client = application.serviceClient;
  const caller = await authzApiFor(admin, ctx, client);
  return {
    ...caller,
    application,
    clientId: client.clientId,
    decide: async request => (await expectOk(await caller.check(request), 'authz check')) as AuthzDecision,
    syncOrThrow: async manifest => (await expectOk(await caller.sync(manifest), 'catalog sync')) as CatalogSyncResult,
    rules: async () => ((await expectOk(await caller.serviceAccess(), 'service access')) as { rules: ServiceAccessRule[] }).rules,
    scoped: async (...scopes) => authzCaller(ctx, await serviceToken(ctx, client, { scope: scopes.join(' ') })),
  };
}

export async function readCatalogPermissions(applicationId: number): Promise<string[]> {
  const rows = await identityDb()<{ name: string }[]>`SELECT name FROM permissions WHERE application_id = ${applicationId} ORDER BY name`;
  return rows.map(row => row.name);
}

export async function readCatalogRoles(applicationId: number): Promise<CatalogRoleRow[]> {
  return identityDb()<CatalogRoleRow[]>`
    SELECT id AS "roleId", role_name AS "roleName", is_default AS "isDefault", bot_grantable AS "botGrantable", bot_resource AS "botResource",
           bot_level AS "botLevel", is_sensitive AS "isSensitive"
    FROM application_roles WHERE application_id = ${applicationId} ORDER BY role_name
  `;
}

export async function readCatalogRole(applicationId: number, roleName: string): Promise<CatalogRoleRow> {
  const [row] = await identityDb()<CatalogRoleRow[]>`
    SELECT id AS "roleId", role_name AS "roleName", is_default AS "isDefault", bot_grantable AS "botGrantable", bot_resource AS "botResource",
           bot_level AS "botLevel", is_sensitive AS "isSensitive"
    FROM application_roles WHERE application_id = ${applicationId} AND role_name = ${roleName}
  `;
  if (!row) throw new AuthzKitError(`no role ${roleName} on application ${applicationId}`);
  return row;
}

export async function readRolePermissions(roleId: number): Promise<string[]> {
  const rows = await identityDb()<{ name: string }[]>`
    SELECT p.name FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ${roleId} ORDER BY p.name
  `;
  return rows.map(row => row.name);
}
