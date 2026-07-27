/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application, DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { ApplicationAccessService } from './application-access.service';
import { ApplicationService } from './application.service';

/**
 * Defining types
 */

/** The audit attribution for a mutation: the acting user's id and, where a browser call, its ip. */
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

/**
 * Declaring the constants
 *
 * The write side of the access model (T-903): platform admins release RESTRICTED apps to organisations
 * (`PLATFORM_RELEASE`) and org admins assign reachable apps to their own allowlist (`ORG_ASSIGNMENT`).
 * Every mutation bumps the affected organisation's grant version through `ApplicationAccessService` so
 * the sign-in gate and every token mint (T-902) converge, and records the change on the audit chain —
 * platform actions on the global chain, org actions on the organisation's own chain.
 */

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

  /* --------------------------- platform-admin release surface --------------------------- */

  /** The organisations an application reaches beyond the universal PUBLIC set: its releases and its org assignments. */
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

  /** Releases a RESTRICTED app to a live team organisation. Idempotent — a repeated release is a no-op. */
  async release(actor: AppAccessActor, applicationId: number, organisationId: bigint): Promise<void> {
    const application = this.applicationService.getApplicationByIdOrThrow(applicationId);
    if (application.visibility !== 'RESTRICTED') throw AppErrorCode.APP_008.create();
    await this.assertReleasableOrganisation(organisationId);

    await this.db.insert(schema.organisationApplications).values({ applicationId, organisationId, source: 'PLATFORM_RELEASE', assignedBy: actor.actorId }).onConflictDoNothing();
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordGlobal(actor, 'application.release.granted', applicationId, { organisationId: organisationId.toString() });
    this.logger.info('released application to organisation', { applicationId, organisationId });
  }

  /** Withdraws a platform release; the org's members lose the RESTRICTED app on their next mint (D-A4). Idempotent. */
  async revoke(actor: AppAccessActor, applicationId: number, organisationId: bigint): Promise<void> {
    this.applicationService.getApplicationByIdOrThrow(applicationId);
    await this.db.delete(schema.organisationApplications).where(this.rowCondition(organisationId, applicationId, 'PLATFORM_RELEASE'));
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordGlobal(actor, 'application.release.revoked', applicationId, { organisationId: organisationId.toString() });
    this.logger.info('revoked application release from organisation', { applicationId, organisationId });
  }

  /* --------------------------- org-admin assignment surface --------------------------- */

  /**
   * The apps an organisation may offer its members — the universal PUBLIC set plus any RESTRICTED apps
   * released to it — each flagged with whether the org has assigned it, alongside the org's access mode.
   */
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

  /**
   * Adds an app to the org's assignment allowlist. Guardrail (D-A1): an org can only assign apps its
   * members could actually reach — an inactive, INTERNAL, or unreleased RESTRICTED app is refused so an
   * assignment can never promise access the sign-in gate would then deny. Idempotent.
   */
  async assign(actor: AppAccessActor, organisationId: bigint, applicationId: number): Promise<void> {
    const application = this.applicationService.getApplicationByIdOrThrow(applicationId);
    if (!application.isActive || application.visibility === 'INTERNAL') throw AppErrorCode.ORG_011.create();
    if (application.visibility === 'RESTRICTED' && !(await this.hasRelease(organisationId, applicationId))) throw AppErrorCode.ORG_011.create();

    await this.db.insert(schema.organisationApplications).values({ applicationId, organisationId, source: 'ORG_ASSIGNMENT', assignedBy: actor.actorId }).onConflictDoNothing();
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordForOrganisation(actor, organisationId, 'org.application.assigned', applicationId);
    this.logger.info('assigned application to organisation', { applicationId, organisationId });
  }

  /** Removes an app from the org's allowlist; members lose it on their next mint (D-A4). Idempotent. */
  async unassign(actor: AppAccessActor, organisationId: bigint, applicationId: number): Promise<void> {
    await this.db.delete(schema.organisationApplications).where(this.rowCondition(organisationId, applicationId, 'ORG_ASSIGNMENT'));
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.recordForOrganisation(actor, organisationId, 'org.application.unassigned', applicationId);
    this.logger.info('unassigned application from organisation', { applicationId, organisationId });
  }

  /**
   * Switches the org between open (`ALL_APPS`) and managed-allowlist (`ASSIGNED_ONLY`) access. Stricter
   * than the rest of org administration: only an elevated owner may flip it, since it governs every
   * member's app surface (field-dependent authorization, mirroring `OrganisationService.changeMemberRole`).
   */
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

  /* --------------------------- internals --------------------------- */

  /** A release target must be a live team organisation; a personal workspace or an absent/inactive org is not one. */
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

  /** Platform-admin actions live on the global chain, attributed to the acting user with the app as target. */
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

  /** Org-scoped actions live on the organisation's own hash chain, like every other org mutation. */
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
