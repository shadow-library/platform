import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { ValidatedSession } from '@server/modules/auth/session';
import { PolicyDecisionService, Principal } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';

import { ADMIN_PERMISSIONS, AdminPermission, PLATFORM_ORG_NAME } from './admin.constants';

export interface AdminActor {
  session: ValidatedSession;
  organisationId: string;
}

@Injectable()
export class AdminAccessService {
  private readonly logger = Logger.getLogger(APP_NAME, AdminAccessService.name);
  private platformOrganisationId: string | null = null;

  constructor(
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

  async authorize(session: ValidatedSession, permission: AdminPermission): Promise<AdminActor> {
    const organisationId = await this.getPlatformOrganisationId();
    const userId = session.userId.toString();
    const decision = await this.policyDecisionService.check({ principal: this.principalOf(session), organisationId, action: permission });
    if (decision.decision !== 'PERMIT') {
      this.logger.warn('admin access denied', { securityEvent: 'admin.access_denied', userId, permission, aal: session.aal });
      throw AppErrorCode.ADM_001.create();
    }
    this.logger.debug('admin access granted', { userId, permission, aal: session.aal });
    return { session, organisationId };
  }

  async listGrantedPermissions(session: ValidatedSession): Promise<AdminPermission[]> {
    const organisationId = await this.getPlatformOrganisationId();
    const held = await this.policyDecisionService.listPermissions(this.principalOf(session), organisationId);
    return Object.values(ADMIN_PERMISSIONS).filter(permission => held.has(permission));
  }

  /** `app:roles:manage` is accepted only when its owning application is the target, preventing cross-application administration. */
  async requireRoleAdmin(session: ValidatedSession, applicationId: number): Promise<AdminActor> {
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
