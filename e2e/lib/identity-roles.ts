/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { identityDb } from './db';

/**
 * Defining types
 */

export type RolePrincipalType = 'USER' | 'SERVICE_ACCOUNT' | 'ORGANISATION';

export interface RolePrincipal {
  type: RolePrincipalType;
  id: string;
}

export interface ApplicationRoleOptions {
  /** Readable tag embedded in the generated role name. */
  label?: string;
  /** Permission names provisioned on the same application and attached to the role. */
  permissions?: string[];
  /** A default role is resolved for every principal of its application, with no assignment. */
  isDefault?: boolean;
}

export interface ApplicationRole {
  readonly roleId: number;
  readonly roleName: string;
  readonly applicationId: number;
}

/**
 * Declaring the constants
 *
 * Application roles, their permissions and the assignments that confer them, written straight to the database.
 * Identity creates roles only through the catalog-sync service API, which needs a service token and a manifest a
 * scenario about role administration does not otherwise want; the assignment API under `/api/v1/admin` is the
 * surface under test and cannot bootstrap the role it assigns. Roles, permissions, role-permission links and
 * assignments all cascade with their application, so a spec that puts them on a throwaway application needs no
 * teardown of its own. Identity re-reads assignments on every decision, so a written row is live at once.
 */

export const PLATFORM_APPLICATION_NAME = 'shadow-identity';

export const IAM_ADMIN_ROLE_NAME = 'IAMAdmin';

export class IdentityRoleError extends Error {
  override readonly name = 'IdentityRoleError';
}

export async function findApplicationIdByName(name: string): Promise<number> {
  const [row] = await identityDb()<{ id: number }[]>`SELECT id FROM applications WHERE name = ${name}`;
  if (!row) throw new IdentityRoleError(`no application named ${name}`);
  return row.id;
}

/** An existing role of `applicationName`, e.g. the platform application's `IAMAdmin`, which a spec may only read. */
export async function findApplicationRoleId(applicationName: string, roleName: string): Promise<number> {
  const [row] = await identityDb()<{ id: number }[]>`
    SELECT ar.id FROM application_roles ar JOIN applications a ON a.id = ar.application_id WHERE a.name = ${applicationName} AND ar.role_name = ${roleName}
  `;
  if (!row) throw new IdentityRoleError(`no role ${roleName} on ${applicationName}`);
  return row.id;
}

export async function createApplicationRole(applicationId: number, options: ApplicationRoleOptions = {}): Promise<ApplicationRole> {
  const sql = identityDb();
  const roleName = `E2E${options.label ?? 'Role'}${randomBytes(4).toString('hex')}`;
  return sql.begin(async tx => {
    const [role] = await tx<{ id: number }[]>`
      INSERT INTO application_roles (application_id, role_name, description, is_default)
      VALUES (${applicationId}, ${roleName}, 'e2e role', ${options.isDefault ?? false})
      RETURNING id
    `;
    if (!role) throw new IdentityRoleError(`role insert on application ${applicationId} returned no row`);

    for (const permission of options.permissions ?? []) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO permissions (application_id, name, description) VALUES (${applicationId}, ${permission}, 'e2e permission')
        ON CONFLICT ON CONSTRAINT permissions_application_name_unique DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `;
      if (!row) throw new IdentityRoleError(`permission ${permission} on application ${applicationId} returned no row`);
      await tx`INSERT INTO role_permissions (role_id, permission_id) VALUES (${role.id}, ${row.id}) ON CONFLICT DO NOTHING`;
    }
    return { roleId: role.id, roleName, applicationId };
  });
}

/** Confers `roleId` on `principal` inside `organisationId`, the row `POST /api/v1/admin/role-assignments` writes. */
export async function assignApplicationRole(principal: RolePrincipal, roleId: number, organisationId: string): Promise<void> {
  await identityDb()`
    INSERT INTO role_assignments (principal_type, principal_id, role_id, organisation_id)
    VALUES (${principal.type}::principal_type, ${principal.id}, ${roleId}, ${organisationId})
    ON CONFLICT ON CONSTRAINT role_assignments_unique DO NOTHING
  `;
}

/** The organisations in which `principal` holds `roleId`, so a spec can prove an assignment landed or was removed. */
export async function findRoleAssignmentOrganisationIds(principal: RolePrincipal, roleId: number): Promise<string[]> {
  const rows = await identityDb()<{ organisationId: string }[]>`
    SELECT organisation_id::text AS "organisationId" FROM role_assignments
    WHERE principal_type = ${principal.type}::principal_type AND principal_id = ${principal.id} AND role_id = ${roleId}
    ORDER BY organisation_id
  `;
  return rows.map(row => row.organisationId);
}

/** Removes every assignment held by `principal`, for principals no cascade reaches — a bot's service account outliving its bot. */
export async function deleteRoleAssignmentsFor(principal: RolePrincipal): Promise<void> {
  await identityDb()`DELETE FROM role_assignments WHERE principal_type = ${principal.type}::principal_type AND principal_id = ${principal.id}`;
}
