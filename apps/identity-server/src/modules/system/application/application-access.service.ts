import { and, eq, isNull, or } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { Application, DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

interface QualifyingMembership {
  organisation: Organisation;
  isDefault: boolean;
}

const GLOBAL_VERSION_KEY = 'app_access_version:global';
const GRANT_CACHE_TTL_SECONDS = 300;

@Injectable()
export class ApplicationAccessService {
  private readonly logger = Logger.getLogger(APP_NAME, ApplicationAccessService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  private orgVersionKey(organisationId: string): string {
    return `app_access_version:org:${organisationId}`;
  }

  private grantCacheKey(organisationId: string, globalVersion: number, orgVersion: number): string {
    return `app_access_grants:${organisationId}:g${globalVersion}:o${orgVersion}`;
  }

  async invalidateOrganisation(organisationId: string): Promise<void> {
    const version = await this.redis.incr(this.orgVersionKey(organisationId));
    this.logger.debug('bumped organisation app-access version, cached grant set invalidated', { organisationId, version });
  }

  async invalidateGlobal(): Promise<void> {
    const version = await this.redis.incr(GLOBAL_VERSION_KEY);
    this.logger.debug('bumped global app-access version, every cached grant set invalidated', { version });
  }

  async resolveAccessibleApplicationIds(userId: bigint): Promise<Set<number>> {
    const organisations = await this.getQualifyingOrganisations(userId);
    const grants = new Set<number>();
    for (const organisation of organisations) {
      const orgGrants = await this.resolveOrganisationGrants(organisation);
      for (const applicationId of orgGrants) grants.add(applicationId);
    }
    this.logger.debug('resolved accessible applications', { userId: userId.toString(), organisationCount: organisations.length, applicationIds: [...grants] });
    return grants;
  }

  async assertUserAccess(userId: bigint, applicationId: number): Promise<void> {
    const application = await this.db.query.applications.findFirst({ where: eq(schema.applications.id, applicationId) });
    if (!application || !application.isActive) throw AppErrorCode.APP_006.create();

    const accessible = await this.resolveAccessibleApplicationIds(userId);
    if (accessible.has(applicationId)) return;

    if (application.visibility === 'INTERNAL') throw AppErrorCode.APP_006.create();
    this.logger.debug('application access denied', { userId: userId.toString(), applicationId, visibility: application.visibility });
    throw AppErrorCode.APP_007.create();
  }

  async listGrantingOrganisations(userId: bigint, applicationId: number): Promise<Organisation[]> {
    const granting = await this.filterGranting(await this.getQualifyingMemberships(userId), applicationId);
    return granting.map(membership => membership.organisation).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }

  async resolveActiveOrganisationId(userId: bigint, applicationId: number): Promise<bigint | null> {
    const granting = await this.filterGranting(await this.getQualifyingMemberships(userId), applicationId);
    if (granting.length === 0) return null;

    const preferred = granting.find(membership => membership.isDefault) ?? granting.find(membership => membership.organisation.type === 'PERSONAL');
    if (preferred) return preferred.organisation.id;
    return granting.reduce((lowest, membership) => (membership.organisation.id < lowest.organisation.id ? membership : lowest)).organisation.id;
  }

  private async filterGranting(memberships: QualifyingMembership[], applicationId: number): Promise<QualifyingMembership[]> {
    const granting: QualifyingMembership[] = [];
    for (const membership of memberships) {
      const grants = await this.resolveOrganisationGrants(membership.organisation);
      if (grants.has(applicationId)) granting.push(membership);
    }
    return granting;
  }

  private async getQualifyingMemberships(userId: bigint): Promise<QualifyingMembership[]> {
    const memberships = await this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.userId, userId), with: { organisation: true } });
    const active = memberships.filter(membership => membership.organisation.status === 'ACTIVE' && this.isMemberActive(membership));

    const managed = await this.db.query.scimDirectory.findMany({ where: and(eq(schema.scimDirectory.userId, userId), eq(schema.scimDirectory.managed, true)) });
    const managedOrgIds = new Set(managed.map(entry => entry.organisationId));
    const qualifying = managed.length === 0 ? active : active.filter(membership => managedOrgIds.has(membership.organisation.id));
    return qualifying.map(membership => ({ organisation: membership.organisation, isDefault: membership.isDefault }));
  }

  private async getQualifyingOrganisations(userId: bigint): Promise<Organisation[]> {
    const memberships = await this.getQualifyingMemberships(userId);
    return memberships.map(membership => membership.organisation);
  }

  private isMemberActive(membership: Organisation.Member): boolean {
    if (membership.status === 'ACTIVE') return true;
    return membership.status === 'SUSPENDED' && membership.statusUntil !== null && membership.statusUntil.getTime() <= Date.now();
  }

  private async resolveOrganisationGrants(organisation: Organisation): Promise<Set<number>> {
    const organisationId = organisation.id.toString();
    const [globalRaw, orgRaw] = await this.redis.mget(GLOBAL_VERSION_KEY, this.orgVersionKey(organisationId));
    const globalVersion = globalRaw ? Number(globalRaw) : 0;
    const orgVersion = orgRaw ? Number(orgRaw) : 0;
    const cacheKey = this.grantCacheKey(organisationId, globalVersion, orgVersion);

    const cached = await this.redis.get(cacheKey);
    if (cached) return new Set(JSON.parse(cached) as number[]);

    const grants = await this.computeOrganisationGrants(organisation);
    await this.redis.set(cacheKey, JSON.stringify([...grants]), 'EX', GRANT_CACHE_TTL_SECONDS);
    return grants;
  }

  private async computeOrganisationGrants(organisation: Organisation): Promise<Set<number>> {
    const reachable = and(
      eq(schema.applications.isActive, true),
      or(isNull(schema.applications.ownerOrganisationId), eq(schema.applications.ownerOrganisationId, organisation.id)),
    );
    const applications = await this.db.query.applications.findMany({ where: reachable });

    const platformApplications = applications.filter(application => application.ownerOrganisationId === null);
    const grants = await this.computePlatformGrants(organisation, platformApplications);
    for (const application of applications) if (application.ownerOrganisationId === organisation.id) grants.add(application.id);
    return grants;
  }

  private async computePlatformGrants(organisation: Organisation, applications: Application[]): Promise<Set<number>> {
    const publicIds = applications.filter(application => application.visibility === 'PUBLIC').map(application => application.id);

    if (organisation.type === 'PERSONAL') return new Set(publicIds);

    const base = new Set(publicIds);
    if (organisation.type === 'TEAM' && organisation.name === PLATFORM_ORG_NAME) {
      for (const application of applications) if (application.visibility === 'INTERNAL') base.add(application.id);
    }

    const releasedIds = await this.grantedApplicationIds(organisation.id, 'PLATFORM_RELEASE');
    for (const application of applications) if (application.visibility === 'RESTRICTED' && releasedIds.has(application.id)) base.add(application.id);

    if (organisation.appAccessMode === 'ALL_APPS') return base;

    const assignedIds = await this.grantedApplicationIds(organisation.id, 'ORG_ASSIGNMENT');
    return new Set([...base].filter(applicationId => assignedIds.has(applicationId)));
  }

  private async grantedApplicationIds(organisationId: bigint, source: Application.OrganisationApplicationSource): Promise<Set<number>> {
    const rows = await this.db.query.organisationApplications.findMany({
      where: and(eq(schema.organisationApplications.organisationId, organisationId), eq(schema.organisationApplications.source, source)),
    });
    return new Set(rows.map(row => row.applicationId));
  }
}
