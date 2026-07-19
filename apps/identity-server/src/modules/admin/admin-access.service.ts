/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
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
  private readonly logger = Logger.getLogger(APP_NAME, AdminAccessService.name);
  private platformOrganisationId: string | null = null;

  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly organisationService: OrganisationService,
  ) {}

  private async getPlatformOrganisationId(): Promise<string> {
    if (this.platformOrganisationId) return this.platformOrganisationId;
    const organisation = await this.organisationService.findTeamByName(PLATFORM_ORG_NAME);
    if (!organisation) {
      this.logger.error('platform organisation missing — admin authorization cannot proceed', { platformOrgName: PLATFORM_ORG_NAME });
      throw AppErrorCode.ADM_002.create();
    }
    this.platformOrganisationId = organisation.id.toString();
    return this.platformOrganisationId;
  }

  private principalOf(session: ValidatedSession): Principal {
    return { type: 'USER', id: session.userId.toString() };
  }

  private async authorize(session: ValidatedSession, permission: AdminPermission): Promise<AdminActor> {
    const organisationId = await this.getPlatformOrganisationId();
    const userId = session.userId.toString();
    const decision = await this.policyDecisionService.check({ principal: this.principalOf(session), organisationId, action: permission });
    if (decision.decision !== 'PERMIT') {
      /** A denied admin call is a security-relevant event: surface it at warn even in production. */
      this.logger.warn('admin access denied', { securityEvent: 'admin.access_denied', userId, permission, aal: session.aal });
      throw AppErrorCode.ADM_001.create();
    }
    this.logger.debug('admin access granted', { userId, permission, aal: session.aal });
    return { session, organisationId };
  }

  async requireRead(request: FastifyRequest, permission: AdminPermission): Promise<AdminActor> {
    const session = await this.sessionAuthService.authenticate(request);
    return this.authorize(session, permission);
  }

  /**
   * Lists which admin permissions the caller's session holds in the platform organisation. The
   * console uses it to decide whether to render at all and which nav entries to show; an empty
   * result means the user is not staff. Authorization on each endpoint remains server-side.
   */
  async listGrantedPermissions(request: FastifyRequest): Promise<AdminPermission[]> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = await this.getPlatformOrganisationId();
    const held = await this.policyDecisionService.listPermissions(this.principalOf(session), organisationId);
    return Object.values(ADMIN_PERMISSIONS).filter(permission => held.has(permission));
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
    const userId = session.userId.toString();

    const platform = await this.policyDecisionService.check({ principal, organisationId, action: ADMIN_PERMISSIONS.rolesManage });
    if (platform.decision === 'PERMIT') {
      this.logger.debug('role admin access granted platform-wide', { userId, applicationId });
      return { session, organisationId };
    }

    const scoped = await this.policyDecisionService.checkForApplication({ principal, organisationId, action: ADMIN_PERMISSIONS.appRolesManage }, applicationId);
    if (scoped.decision === 'PERMIT') {
      this.logger.debug('role admin access granted for application', { userId, applicationId });
      return { session, organisationId };
    }
    this.logger.warn('role admin access denied', { securityEvent: 'admin.access_denied', userId, applicationId, aal: session.aal });
    throw AppErrorCode.ADM_001.create();
  }
}
