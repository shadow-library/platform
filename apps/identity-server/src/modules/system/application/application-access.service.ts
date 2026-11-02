import { and, eq, isNull, or } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, CACHE_VERSION_TTL_SECONDS } from '@server/constants';
import { Application, DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

interface QualifyingMembership {
  organisation: Organisation;
  isDefault: boolean;
}

export interface UserApplicationAccess {
  organisations: Organisation[];
  activeOrganisationId: bigint;
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
    const key = this.orgVersionKey(organisationId);
    const results = await this.redis.multi().incr(key).call('EXPIRE', key, CACHE_VERSION_TTL_SECONDS).exec();
    const version = results?.[0]?.[1];
    this.logger.debug('bumped organisation app-access version, cached grant set invalidated', { organisationId, version });
  }

  async invalidateGlobal(): Promise<void> {
    const version = await this.redis.incr(GLOBAL_VERSION_KEY);
    this.logger.debug('bumped global app-access version, every cached grant set invalidated', { version });
  }

  async resolveAccessibleApplicationIds(userId: bigint): Promise<Set<number>> {
    const memberships = await this.getQualifyingMemberships(userId);
    const grants = new Set<number>();
    for (const orgGrants of await this.resolveGrantsByOrganisation(memberships.map(membership => membership.organisation))) {
      for (const applicationId of orgGrants) grants.add(applicationId);
    }
    this.logger.debug('resolved accessible applications', { userId: userId.toString(), organisationCount: memberships.length, applicationIds: [...grants] });
    return grants;
  }

  async listOrganisationApplicationIds(organisationId: bigint): Promise<Set<number>> {
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId) });
    if (!organisation) throw AppErrorCode.ORG_002.create();
    const [grants] = await this.resolveGrantsByOrganisation([organisation]);
    return grants ?? new Set();
  }

  async assertUserAccess(userId: bigint, applicationId: number): Promise<UserApplicationAccess> {
    const [application, memberships] = await Promise.all([
      this.db.query.applications.findFirst({ where: eq(schema.applications.id, applicationId) }),
      this.getQualifyingMemberships(userId),
    ]);
    if (!application || !application.isActive) throw AppErrorCode.APP_006.create();

    const granting = await this.filterGranting(memberships, applicationId);
    if (granting.length > 0) return { organisations: this.sortById(granting), activeOrganisationId: this.pickActive(granting) };

    if (application.visibility === 'INTERNAL') throw AppErrorCode.APP_006.create();
    this.logger.debug('application access denied', { userId: userId.toString(), applicationId, visibility: application.visibility });
    throw AppErrorCode.APP_007.create();
  }

  async listGrantingOrganisations(userId: bigint, applicationId: number): Promise<Organisation[]> {
    return this.sortById(await this.filterGranting(await this.getQualifyingMemberships(userId), applicationId));
  }

  async resolveActiveOrganisationId(userId: bigint, applicationId: number): Promise<bigint | null> {
    const granting = await this.filterGranting(await this.getQualifyingMemberships(userId), applicationId);
    return granting.length === 0 ? null : this.pickActive(granting);
  }

  private sortById(granting: QualifyingMembership[]): Organisation[] {
    return granting.map(membership => membership.organisation).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }

  private pickActive(granting: QualifyingMembership[]): bigint {
    const preferred = granting.find(membership => membership.isDefault) ?? granting.find(membership => membership.organisation.type === 'PERSONAL');
    if (preferred) return preferred.organisation.id;
    return granting.reduce((lowest, membership) => (membership.organisation.id < lowest.organisation.id ? membership : lowest)).organisation.id;
  }

  private async filterGranting(memberships: QualifyingMembership[], applicationId: number): Promise<QualifyingMembership[]> {
    const grants = await this.resolveGrantsByOrganisation(memberships.map(membership => membership.organisation));
    return memberships.filter((_, index) => grants[index]?.has(applicationId));
  }

  private async getQualifyingMemberships(userId: bigint): Promise<QualifyingMembership[]> {
    const [memberships, managed] = await Promise.all([
      this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.userId, userId), with: { organisation: true } }),
      this.db.query.scimDirectory.findMany({ where: and(eq(schema.scimDirectory.userId, userId), eq(schema.scimDirectory.managed, true)) }),
    ]);
    const active = memberships.filter(membership => membership.organisation.status === 'ACTIVE' && this.isMemberActive(membership));
    const managedOrgIds = new Set(managed.map(entry => entry.organisationId));
    const qualifying = managed.length === 0 ? active : active.filter(membership => managedOrgIds.has(membership.organisation.id));
    return qualifying.map(membership => ({ organisation: membership.organisation, isDefault: membership.isDefault }));
  }

  private isMemberActive(membership: Organisation.Member): boolean {
    if (membership.status === 'ACTIVE') return true;
    return membership.status === 'SUSPENDED' && membership.statusUntil !== null && membership.statusUntil.getTime() <= Date.now();
  }

  private async resolveGrantsByOrganisation(organisations: Organisation[]): Promise<Set<number>[]> {
    if (organisations.length === 0) return [];
    const organisationIds = organisations.map(organisation => organisation.id.toString());
    const versions = this.redis.multi().call('GET', GLOBAL_VERSION_KEY);
    for (const organisationId of organisationIds) {
      const orgKey = this.orgVersionKey(organisationId);
      versions.call('GET', orgKey).call('EXPIRE', orgKey, CACHE_VERSION_TTL_SECONDS);
    }
    const results = await versions.exec();
    const globalVersion = Number(results?.[0]?.[1] ?? 0);
    const cacheKeys = organisationIds.map((organisationId, index) => this.grantCacheKey(organisationId, globalVersion, Number(results?.[1 + index * 2]?.[1] ?? 0)));

    const cached = await this.redis.mget(...cacheKeys);
    return Promise.all(
      organisations.map(async (organisation, index) => {
        const hit = cached[index];
        if (hit) return new Set(JSON.parse(hit) as number[]);
        const grants = await this.computeOrganisationGrants(organisation);
        await this.redis.set(cacheKeys[index] as string, JSON.stringify([...grants]), 'EX', GRANT_CACHE_TTL_SECONDS);
        return grants;
      }),
    );
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
    if (organisation.isPlatform) {
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
