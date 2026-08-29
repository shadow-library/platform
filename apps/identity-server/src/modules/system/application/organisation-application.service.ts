import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application, DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { ApplicationAccessService } from './application-access.service';
import { ApplicationService } from './application.service';

export interface AppAccessActor {
  actorId: string;
  ip?: string;
}

export interface ApplicationOrganisationRow {
  organisationId: bigint;
  slug: string;
  name: string;
  source: Application.OrganisationApplicationSource;
  assignedAt: Date;
  assignedBy: string | null;
}

export interface OrganisationApplicationRow {
  id: number;
  name: string;
  displayName: string | null;
  subDomain: string;
  logoUrl: string | null;
  homePageUrl: string | null;
  visibility: Application.Visibility;
  assigned: boolean;
}

export interface OrganisationApplicationsView {
  appAccessMode: Organisation.AppAccessMode;
  applications: OrganisationApplicationRow[];
}

@Injectable()
export class OrganisationApplicationService {
  private readonly logger = Logger.getLogger(APP_NAME, OrganisationApplicationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly applicationService: ApplicationService,
    private readonly accessService: ApplicationAccessService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listApplicationOrganisations(applicationId: number): Promise<ApplicationOrganisationRow[]> {
    this.applicationService.getApplicationByIdOrThrow(applicationId);
    return this.db
      .select({
        organisationId: schema.organisationApplications.organisationId,
        slug: schema.organisations.slug,
        name: schema.organisations.name,
        source: schema.organisationApplications.source,
        assignedAt: schema.organisationApplications.assignedAt,
        assignedBy: schema.organisationApplications.assignedBy,
      })
      .from(schema.organisationApplications)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.organisationApplications.organisationId))
      .where(eq(schema.organisationApplications.applicationId, applicationId))
      .orderBy(schema.organisationApplications.assignedAt);
  }

  async release(actor: AppAccessActor, applicationId: number, organisationId: bigint): Promise<void> {
    const application = this.applicationService.getApplicationByIdOrThrow(applicationId);
    if (application.ownerOrganisationId !== null) throw AppErrorCode.APP_009.create();
    if (application.visibility !== 'RESTRICTED') throw AppErrorCode.APP_008.create();
    await this.assertReleasableOrganisation(organisationId);

    await this.db.insert(schema.organisationApplications).values({ applicationId, organisationId, source: 'PLATFORM_RELEASE', assignedBy: actor.actorId }).onConflictDoNothing();
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordGlobal(actor, 'application.release.granted', applicationId, { organisationId: organisationId.toString() });
    this.logger.info('released application to organisation', { applicationId, organisationId });
  }

  async revoke(actor: AppAccessActor, applicationId: number, organisationId: bigint): Promise<void> {
    this.applicationService.getApplicationByIdOrThrow(applicationId);
    await this.db.delete(schema.organisationApplications).where(this.rowCondition(organisationId, applicationId, 'PLATFORM_RELEASE'));
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordGlobal(actor, 'application.release.revoked', applicationId, { organisationId: organisationId.toString() });
    this.logger.info('revoked application release from organisation', { applicationId, organisationId });
  }

  async listForOrganisation(organisationId: bigint): Promise<OrganisationApplicationsView> {
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId) });
    if (!organisation) throw AppErrorCode.ORG_002.create();

    const applications = await this.db.query.applications.findMany({ where: eq(schema.applications.isActive, true) });
    const released = await this.grantedApplicationIds(organisationId, 'PLATFORM_RELEASE');
    const assigned = await this.grantedApplicationIds(organisationId, 'ORG_ASSIGNMENT');

    const offerable = applications.filter(application => application.visibility === 'PUBLIC' || (application.visibility === 'RESTRICTED' && released.has(application.id)));
    return {
      appAccessMode: organisation.appAccessMode,
      applications: offerable.map(application => ({
        id: application.id,
        name: application.name,
        displayName: application.displayName,
        subDomain: application.subDomain,
        logoUrl: application.logoUrl,
        homePageUrl: application.homePageUrl,
        visibility: application.visibility,
        assigned: assigned.has(application.id),
      })),
    };
  }

  async assign(actor: AppAccessActor, organisationId: bigint, applicationId: number): Promise<void> {
    await this.assertReachable(organisationId, applicationId);

    await this.db.insert(schema.organisationApplications).values({ applicationId, organisationId, source: 'ORG_ASSIGNMENT', assignedBy: actor.actorId }).onConflictDoNothing();
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordForOrganisation(actor, organisationId, 'org.application.assigned', applicationId);
    this.logger.info('assigned application to organisation', { applicationId, organisationId });
  }

  async unassign(actor: AppAccessActor, organisationId: bigint, applicationId: number): Promise<void> {
    await this.db.delete(schema.organisationApplications).where(this.rowCondition(organisationId, applicationId, 'ORG_ASSIGNMENT'));
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordForOrganisation(actor, organisationId, 'org.application.unassigned', applicationId);
    this.logger.info('unassigned application from organisation', { applicationId, organisationId });
  }

  async changeAppAccessMode(
    actor: AppAccessActor,
    organisationId: bigint,
    caller: { role: Organisation.MemberRole; elevated: boolean },
    mode: Organisation.AppAccessMode,
  ): Promise<Organisation> {
    if (!caller.elevated) throw AppErrorCode.AUTH_006.create();
    if (caller.role !== 'OWNER') throw AppErrorCode.ORG_007.create();

    const [organisation] = await this.db
      .update(schema.organisations)
      .set({ appAccessMode: mode, updatedAt: new Date() })
      .where(eq(schema.organisations.id, organisationId))
      .returning();
    if (!organisation) throw AppErrorCode.ORG_002.create();
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordForOrganisation(actor, organisationId, 'org.app_access_mode.changed', undefined, { mode });
    this.logger.info('changed organisation app access mode', { organisationId, mode });
    return organisation;
  }

  async assertReachable(organisationId: bigint, applicationId: number): Promise<void> {
    const application = this.applicationService.getApplicationByIdOrThrow(applicationId);
    if (application.ownerOrganisationId !== null) throw AppErrorCode.APP_009.create();
    if (!application.isActive || application.visibility === 'INTERNAL') throw AppErrorCode.ORG_011.create();
    if (application.visibility === 'RESTRICTED' && !(await this.hasRelease(organisationId, applicationId))) throw AppErrorCode.ORG_011.create();
  }

  private async assertReleasableOrganisation(organisationId: bigint): Promise<void> {
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId) });
    if (!organisation || organisation.status !== 'ACTIVE') throw AppErrorCode.ORG_002.create();
    if (organisation.type !== 'TEAM') throw AppErrorCode.ORG_003.create();
  }

  private async hasRelease(organisationId: bigint, applicationId: number): Promise<boolean> {
    const row = await this.db.query.organisationApplications.findFirst({ where: this.rowCondition(organisationId, applicationId, 'PLATFORM_RELEASE') });
    return row !== undefined;
  }

  private async grantedApplicationIds(organisationId: bigint, source: Application.OrganisationApplicationSource): Promise<Set<number>> {
    const rows = await this.db.query.organisationApplications.findMany({
      where: and(eq(schema.organisationApplications.organisationId, organisationId), eq(schema.organisationApplications.source, source)),
    });
    return new Set(rows.map(row => row.applicationId));
  }

  private rowCondition(organisationId: bigint, applicationId: number, source: Application.OrganisationApplicationSource) {
    return and(
      eq(schema.organisationApplications.organisationId, organisationId),
      eq(schema.organisationApplications.applicationId, applicationId),
      eq(schema.organisationApplications.source, source),
    );
  }

  private recordGlobal(actor: AppAccessActor, action: string, applicationId: number, detail: Record<string, unknown>): Promise<unknown> {
    return this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.actorId,
      targetType: 'application',
      targetId: applicationId.toString(),
      ipAddress: actor.ip ?? null,
      detail,
    });
  }

  private recordForOrganisation(actor: AppAccessActor, organisationId: bigint, action: string, applicationId?: number, detail?: Record<string, unknown>): Promise<unknown> {
    return this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.actorId,
      organisationId: organisationId.toString(),
      targetType: applicationId !== undefined ? 'application' : undefined,
      targetId: applicationId?.toString(),
      ipAddress: actor.ip ?? null,
      detail: detail ?? null,
    });
  }
}
