/**
 * Importing npm packages
 */
import { type APIRequestContext, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { clientIpHeaders } from './client-ip';
import { identityDb } from './db';
import { requireProductUrl } from './env';
import { addOrganisationMember, findPlatformOrganisationId } from './identity-orgs';
import { assignApplicationRole, createApplicationRole, findApplicationIdByName } from './identity-roles';
import { createIdentitySession, type IdentitySession, identityStorageState, type SessionAal } from './identity-sessions';
import { createIdentityUser, deleteIdentityUser, type IdentityUser } from './identity-users';

/**
 * Defining types
 */

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
 * Declaring the constants
 *
 * Pulse is an INTERNAL application: `ApplicationAccessService.computePlatformGrants` grants an INTERNAL app only
 * through the platform organisation ("Shadow Platform"), and `resolveActiveOrganisationId` then narrows a pulse
 * session to the organisation that granted it — so a staff account is a platform-organisation member, and every
 * permission it holds is assigned in that organisation. Membership alone confers nothing else: identity's admin
 * surface authorizes on a platform-organisation *permission* (`AdminAccessService.authorize`), not on membership.
 *
 * Permissions come from a throwaway role on pulse's own application, because the route guard asks identity's PDP
 * for the exact permission name pulse declares. A name pulse declares that identity's catalogue is missing
 * (`pulse:messages:read` today) is created with the role and dropped again afterwards while nothing links it.
 */

export class PulseStaffError extends Error {
  override readonly name = 'PulseStaffError';
}

const PULSE_APPLICATION_NAME = 'pulse';

/**
 * Removes a staff account: the role's own permission links and assignments cascade with it, and the
 * platform-organisation membership and every session cascade with the user.
 *
 * A permission row is dropped only while no role links it, which is both what makes it safe to run for every
 * permission the account held — each name identity's own catalogue carries is linked by a pulse role and therefore
 * survives — and what lets concurrent tests share one created row: whoever tears down last removes it.
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
 * A staff account with a live pulse session, holding exactly `permissions`.
 *
 * The OIDC hop is driven over an `APIRequestContext` that starts out carrying only identity's session cookies:
 * following `GET /api/auth/login` through identity's authorize endpoint and back into pulse's callback leaves
 * pulse's own session cookie in the same jar, which every later call on `ctx` then presents. A failure anywhere
 * after the account exists takes the account back down, so a caller's teardown has nothing to inherit.
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
