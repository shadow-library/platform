import { type APIRequestContext, request } from '@playwright/test';

import { clientIpHeaders } from './client-ip';
import { addOrganisationMember, findPlatformOrganisationId } from './identity-orgs';
import { assignApplicationRole, deleteRoleAssignmentsFor, findApplicationRoleId } from './identity-roles';
import { createIdentitySession, type IdentitySession, identityStorageState, type SessionAal } from './identity-sessions';
import { createIdentityUser, deleteIdentityUser, type IdentityUser } from './identity-users';

export type SynapseRole = 'SynapseViewer' | 'SynapseOperator' | 'SynapseAdmin' | 'SynapseCredentialsAdmin';

export interface SynapseStaffOptions {
  label?: string;
  roles?: readonly SynapseRole[];
  aal?: SessionAal;
  clientIp?: string;
}

interface SynapseStaffRemnants {
  readonly user: IdentityUser;
  readonly ctx?: APIRequestContext;
}

export interface SynapseStaff extends SynapseStaffRemnants {
  readonly session: IdentitySession;
  readonly ctx: APIRequestContext;
}

const SYNAPSE_URL_ENV_VAR = 'E2E_SYNAPSE_URL';
const SYNAPSE_DEFAULT_URL = 'https://synapse.shadow-apps.test';
const SYNAPSE_APPLICATION_NAME = 'synapse';

export class SynapseStaffError extends Error {
  override readonly name = 'SynapseStaffError';
}

export function getSynapseUrl(): string | undefined {
  const raw = process.env[SYNAPSE_URL_ENV_VAR];
  const value = raw === undefined ? SYNAPSE_DEFAULT_URL : raw.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

export function requireSynapseUrl(): string {
  const url = getSynapseUrl();
  if (!url) throw new SynapseStaffError(`${SYNAPSE_URL_ENV_VAR} is set to an empty value, so Synapse is opted out of this run`);
  return url;
}

async function removeSynapseStaff(staff: SynapseStaffRemnants): Promise<void> {
  await staff.ctx?.dispose();
  await deleteRoleAssignmentsFor({ type: 'USER', id: staff.user.userId });
  await deleteIdentityUser(staff.user);
}

export function deleteSynapseStaff(staff: SynapseStaff): Promise<void> {
  return removeSynapseStaff(staff);
}

export function synapseGuest(clientIp?: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL: requireSynapseUrl(), ignoreHTTPSErrors: true, extraHTTPHeaders: clientIp ? clientIpHeaders(clientIp) : undefined });
}

/** Synapse is an INTERNAL application, so a staff account is a platform-organisation member and holds its roles there. */
export async function createSynapseStaff(options: SynapseStaffOptions = {}): Promise<SynapseStaff> {
  const synapseUrl = requireSynapseUrl();
  const user = await createIdentityUser({ label: `synapse-${options.label ?? 'staff'}` });
  let remnants: SynapseStaffRemnants = { user };

  try {
    const platformOrgId = await findPlatformOrganisationId();
    await addOrganisationMember(platformOrgId, user.userId, { role: 'MEMBER' });
    for (const roleName of options.roles ?? []) {
      await assignApplicationRole({ type: 'USER', id: user.userId }, await findApplicationRoleId(SYNAPSE_APPLICATION_NAME, roleName), platformOrgId);
    }

    const session = await createIdentitySession(user.userId, { aal: options.aal ?? 'AAL1' });
    const ctx = await request.newContext({
      baseURL: synapseUrl,
      ignoreHTTPSErrors: true,
      storageState: identityStorageState(session),
      extraHTTPHeaders: options.clientIp ? clientIpHeaders(options.clientIp) : undefined,
    });
    remnants = { user, ctx };

    const hop = await ctx.get('/api/auth/login?return_to=/');
    const probe = await ctx.get('/api/auth/session');
    if (!probe.ok())
      throw new SynapseStaffError(`no synapse session for ${user.email} after the OIDC hop (login ${hop.status()}, session ${probe.status()} ${await probe.text()})`);
    return { user, session, ctx };
  } catch (error) {
    await removeSynapseStaff(remnants).catch(() => undefined);
    throw error;
  }
}
