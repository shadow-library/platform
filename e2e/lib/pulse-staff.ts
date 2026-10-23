import { type APIRequestContext, request } from '@playwright/test';

import { clientIpHeaders } from './client-ip';
import { identityDb } from './db';
import { requireProductUrl } from './env';
import { addOrganisationMember, findPlatformOrganisationId } from './identity-orgs';
import { assignApplicationRole, createApplicationRole, findApplicationIdByName } from './identity-roles';
import { createIdentitySession, type IdentitySession, identityStorageState, type SessionAal } from './identity-sessions';
import { createIdentityUser, deleteIdentityUser, type IdentityUser } from './identity-users';

export interface PulseStaffOptions {
  /** Readable tag embedded in the generated email and role name, e.g. `logs-only`. */
  label?: string;
  /** Pulse permission names conferred through a throwaway pulse role assigned in the platform organisation. */
  permissions?: readonly string[];
  /** Default `AAL1`; no pulse route under test requires elevation. */
  aal?: SessionAal;
  /** Sent as `X-Forwarded-For`, so identity charges this test's own address for the OIDC hop. */
  clientIp?: string;
}

/** What removing a staff account needs, which a half-built one also satisfies. */
interface PulseStaffRemnants {
  readonly user: IdentityUser;
  /** The throwaway pulse role the permissions were granted through, if one was created. */
  readonly roleId?: number;
  readonly permissions: readonly string[];
  readonly ctx?: APIRequestContext;
}

export interface PulseStaff extends PulseStaffRemnants {
  readonly session: IdentitySession;
  /** A pulse `APIRequestContext` carrying this account's `__Host-shadow-session`, and identity's cookies for a re-hop. */
  readonly ctx: APIRequestContext;
}

/**
 * Pulse is an INTERNAL application: `ApplicationAccessService.computePlatformGrants` grants it only through the platform organisation, and `resolveActiveOrganisationId`
 * narrows a pulse session to the organisation that granted it. So a staff account is a platform-organisation member with every permission assigned there;
 * membership alone confers nothing, since identity's admin surface authorizes on a platform-organisation permission (`AdminAccessService.authorize`).
 *
 * Permissions come from a throwaway role on pulse's own application, because the route guard asks identity's PDP for the exact name pulse declares.
 * A name pulse declares that identity's catalogue lacks is created with the role and dropped afterwards while nothing links it.
 */

export class PulseStaffError extends Error {
  override readonly name = 'PulseStaffError';
}

const PULSE_APPLICATION_NAME = 'pulse';

/**
 * Removes a staff account; the role's permission links and assignments cascade with it, and the membership and sessions with the user.
 * A permission row is dropped only while no role links it, so running this for every permission held is safe (catalogue names stay linked by a pulse role)
 * and concurrent tests can share one created row: whoever tears down last removes it.
 */
async function removePulseStaff(staff: PulseStaffRemnants): Promise<void> {
  const sql = identityDb();
  await staff.ctx?.dispose();
  if (staff.roleId !== undefined) await sql`DELETE FROM application_roles WHERE id = ${staff.roleId}`;
  await deleteIdentityUser(staff.user);
  if (staff.permissions.length === 0) return;

  const applicationId = await findApplicationIdByName(PULSE_APPLICATION_NAME);
  await sql`
    DELETE FROM permissions p
    WHERE p.application_id = ${applicationId} AND p.name IN ${sql([...staff.permissions])}
      AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id)
  `;
}

export function deletePulseStaff(staff: PulseStaff): Promise<void> {
  return removePulseStaff(staff);
}

/**
 * A staff account with a live pulse session, holding exactly `permissions`. The OIDC hop runs over an `APIRequestContext` that starts with identity's session
 * cookies only: `GET /api/auth/login` through authorize and back into pulse's callback leaves pulse's session cookie in the same jar.
 * A failure after the account exists takes it back down.
 */
export async function createPulseStaff(options: PulseStaffOptions = {}): Promise<PulseStaff> {
  const pulseUrl = requireProductUrl('pulse');
  const label = options.label ?? 'staff';
  const permissions = [...(options.permissions ?? [])];

  const user = await createIdentityUser({ label: `pulse-${label}` });
  let remnants: PulseStaffRemnants = { user, permissions };

  try {
    const platformOrgId = await findPlatformOrganisationId();
    await addOrganisationMember(platformOrgId, user.userId, { role: 'MEMBER' });

    if (permissions.length > 0) {
      const applicationId = await findApplicationIdByName(PULSE_APPLICATION_NAME);
      const role = await createApplicationRole(applicationId, { label: `Pulse${label.replace(/[^a-zA-Z0-9]/g, '')}`, permissions });
      remnants = { ...remnants, roleId: role.roleId };
      await assignApplicationRole({ type: 'USER', id: user.userId }, role.roleId, platformOrgId);
    }

    const session = await createIdentitySession(user.userId, { aal: options.aal ?? 'AAL1' });
    const ctx = await request.newContext({
      baseURL: pulseUrl,
      ignoreHTTPSErrors: true,
      storageState: identityStorageState(session),
      extraHTTPHeaders: options.clientIp ? clientIpHeaders(options.clientIp) : undefined,
    });
    remnants = { ...remnants, ctx };

    const hop = await ctx.get('/api/auth/login?return_to=/');
    const probe = await ctx.get('/api/auth/session');
    if (!probe.ok()) throw new PulseStaffError(`no pulse session for ${user.email} after the OIDC hop (login ${hop.status()}, session ${probe.status()} ${await probe.text()})`);
    return { ...remnants, session, ctx };
  } catch (error) {
    await removePulseStaff(remnants).catch(() => undefined);
    throw error;
  }
}
