/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { and, eq, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { DnsTxtResolver } from './dns-txt.resolver';

/**
 * Defining types
 */

export interface DomainChallenge {
  domain: Organisation.Domain;
  txtRecordName: string;
  txtRecordValue: string;
}

/**
 * Declaring the constants
 *
 * Ownership is proven with a DNS TXT record at `_shadow-identity.<domain>`. Only one organisation
 * may hold a domain VERIFIED at a time (partial unique index is the authority; the service
 * pre-checks for a friendlier failure). A VERIFIED domain never demotes on a failed re-check —
 * transient DNS outages must not strip a tenant's domain; removal is an explicit operation.
 */
const TXT_PREFIX = '_shadow-identity';
const TXT_VALUE_PREFIX = 'shadow-identity-verification=';
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

@Injectable()
export class DomainService {
  private readonly logger = Logger.getLogger(APP_NAME, DomainService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly dnsTxtResolver: DnsTxtResolver,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  challengeOf(domain: Organisation.Domain): DomainChallenge {
    return { domain, txtRecordName: `${TXT_PREFIX}.${domain.domain}`, txtRecordValue: `${TXT_VALUE_PREFIX}${domain.verificationToken}` };
  }

  async register(organisationId: bigint, rawDomain: string): Promise<DomainChallenge> {
    const domain = rawDomain.toLowerCase().replace(/\.$/, '');
    if (!DOMAIN_PATTERN.test(domain)) throw AppErrorCode.ORG_008.create();

    const token = randomBytes(16).toString('hex');
    const [created] = await this.db
      .insert(schema.organisationDomains)
      .values({ organisationId, domain, verificationToken: token })
      .onConflictDoNothing({ target: [schema.organisationDomains.organisationId, schema.organisationDomains.domain] })
      .returning();
    if (!created) throw AppErrorCode.ORG_009.create();
    this.logger.info('Domain registered for verification', { organisationId, domain });
    return this.challengeOf(created);
  }

  async list(organisationId: bigint): Promise<Organisation.Domain[]> {
    return this.db.query.organisationDomains.findMany({ where: eq(schema.organisationDomains.organisationId, organisationId) });
  }

  async getById(organisationId: bigint, domainId: bigint): Promise<Organisation.Domain> {
    const domain = await this.db.query.organisationDomains.findFirst({
      where: and(eq(schema.organisationDomains.id, domainId), eq(schema.organisationDomains.organisationId, organisationId)),
    });
    if (!domain) throw AppErrorCode.ORG_010.create();
    return domain;
  }

  /** Runs the TXT lookup and records the outcome; VERIFIED status only ever improves or holds. */
  async verify(organisationId: bigint, domainId: bigint): Promise<Organisation.Domain> {
    const domain = await this.getById(organisationId, domainId);
    const checkedAt = new Date();
    const expected = `${TXT_VALUE_PREFIX}${domain.verificationToken}`;

    let matched: string | undefined;
    let failure: string | undefined;
    try {
      const records = await this.dnsTxtResolver.resolveTxt(`${TXT_PREFIX}.${domain.domain}`);
      matched = records.find(record => record.trim() === expected);
      if (!matched) failure = 'verification TXT record not found';
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    if (matched) {
      const holder = await this.db.query.organisationDomains.findFirst({
        where: and(
          eq(schema.organisationDomains.domain, domain.domain),
          eq(schema.organisationDomains.status, 'VERIFIED'),
          ne(schema.organisationDomains.organisationId, organisationId),
        ),
      });
      if (holder) {
        matched = undefined;
        failure = 'domain is verified by another organisation';
      }
    }

    const changes = matched
      ? { status: 'VERIFIED' as const, verifiedAt: domain.verifiedAt ?? checkedAt, matchedRecord: matched, lastCheckedAt: checkedAt, lastCheckError: null }
      : { status: domain.status === 'VERIFIED' ? ('VERIFIED' as const) : ('FAILED' as const), lastCheckedAt: checkedAt, lastCheckError: failure ?? null };

    try {
      const [updated] = await this.db.update(schema.organisationDomains).set(changes).where(eq(schema.organisationDomains.id, domain.id)).returning();
      if (!updated) throw AppErrorCode.ORG_010.create();
      return updated;
    } catch (error) {
      /** Lost the race for the partial unique index: another org verified between pre-check and update. */
      if (AppError.is(error)) throw error;
      const [failed] = await this.db
        .update(schema.organisationDomains)
        .set({ status: 'FAILED', lastCheckedAt: checkedAt, lastCheckError: 'domain is verified by another organisation' })
        .where(eq(schema.organisationDomains.id, domain.id))
        .returning();
      if (!failed) throw AppErrorCode.ORG_010.create();
      return failed;
    }
  }

  async remove(organisationId: bigint, domainId: bigint): Promise<Organisation.Domain> {
    const domain = await this.getById(organisationId, domainId);
    await this.db.delete(schema.organisationDomains).where(eq(schema.organisationDomains.id, domain.id));
    this.logger.info('Domain removed', { organisationId, domain: domain.domain });
    return domain;
  }
}
