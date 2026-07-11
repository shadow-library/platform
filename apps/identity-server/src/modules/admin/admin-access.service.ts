/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionAuthService, ValidatedSession } from '@server/modules/auth/session';
import { PolicyDecisionService, Principal } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';

import { ADMIN_PERMISSIONS, AdminPermission, PLATFORM_ORG_NAME } from './admin.constants';

/**
 * Defining types
 */

export interface AdminActor {
  session: ValidatedSession;
  /** The platform organisation in which the actor's administrative assignment was resolved. */
  organisationId: string;
}

/**
 * Declaring the constants
 *
 * Every admin endpoint authenticates the caller's first-party session, then asks the PDP whether
 * the caller holds the required permission in the platform organisation (T-601). Reads accept any
 * live session; mutations demand a fresh second-factor proof (AAL2 step-up) so a hijacked idle
 * session cannot administrate.
 */

@Injectable()
export class AdminAccessService {
  private platformOrganisationId: string | null = null;

  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly organisationService: OrganisationService,
  ) {}

  private async getPlatformOrganisationId(): Promise<string> {
    if (this.platformOrganisationId) return this.platformOrganisationId;
    const organisation = await this.organisationService.findTeamByName(PLATFORM_ORG_NAME);
    if (!organisation) throw new ServerError(AppErrorCode.ADM_002);
    this.platformOrganisationId = organisation.id.toString();
    return this.platformOrganisationId;
  }

  private principalOf(session: ValidatedSession): Principal {
    return { type: 'USER', id: session.userId.toString() };
  }

  private async authorize(session: ValidatedSession, permission: AdminPermission): Promise<AdminActor> {
    const organisationId = await this.getPlatformOrganisationId();
    const decision = await this.policyDecisionService.check({ principal: this.principalOf(session), organisationId, action: permission });
    if (decision.decision !== 'PERMIT') throw new ServerError(AppErrorCode.ADM_001);
    return { session, organisationId };
  }

  async requireRead(request: FastifyRequest, permission: AdminPermission): Promise<AdminActor> {
    const session = await this.sessionAuthService.authenticate(request);
    return this.authorize(session, permission);
  }

  async requireMutation(request: FastifyRequest, permission: AdminPermission): Promise<AdminActor> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    return this.authorize(session, permission);
  }

  /**
   * Role administration accepts two tiers: `iam:roles:manage` works platform-wide, while
   * `app:roles:manage` only counts when the permission is owned by the application whose roles
   * are being touched — so an application admin can never reach across applications.
   */
  async requireRoleAdmin(request: FastifyRequest, applicationId: number): Promise<AdminActor> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    const organisationId = await this.getPlatformOrganisationId();
    const principal = this.principalOf(session);

    const platform = await this.policyDecisionService.check({ principal, organisationId, action: ADMIN_PERMISSIONS.rolesManage });
    if (platform.decision === 'PERMIT') return { session, organisationId };

    const scoped = await this.policyDecisionService.checkForApplication({ principal, organisationId, action: ADMIN_PERMISSIONS.appRolesManage }, applicationId);
    if (scoped.decision === 'PERMIT') return { session, organisationId };
    throw new ServerError(AppErrorCode.ADM_001);
  }
}
