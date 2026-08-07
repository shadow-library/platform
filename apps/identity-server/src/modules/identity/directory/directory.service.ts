import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME, REGEX } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

export interface ResolvedUser {
  email: string;
  userId: string;
}

export interface DirectoryUser {
  userId: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * The directory seam other first-party services reach through when they must name a person the
 * caller only knows by email — sharing a novel with `someone@example.com`, and nothing broader.
 *
 * Two rules make it safe to expose at all. Only an **exact, verified** address resolves, because a
 * verified address is globally unique here (`user_emails_verified_email_unique`), so a hit names
 * exactly one account and there is no substring surface to walk. And an address that resolves to
 * nothing is simply **absent** from the answer — never echoed with a reason — so a caller learns
 * "no account you may name" without learning whether the address is unknown, unverified or closed
 * (D-A3). It remains an enumeration oracle by construction, which is why every call is audited and
 * the route is service-only.
 */

const RESOLVABLE_STATUSES = ['ACTIVE', 'INACTIVE', 'DISABLED', 'BLOCKED', 'SUSPENDED'] as const;

const MAX_ID_DIGITS = 19;

@Injectable()
export class DirectoryService {
  private readonly logger = Logger.getLogger(APP_NAME, DirectoryService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async resolveByEmail(emails: string[], callerClientId: string): Promise<ResolvedUser[]> {
    const bySpelling = new Map<string, string>();
    for (const email of emails) if (REGEX.EMAIL.test(email)) bySpelling.set(email.toLowerCase(), email);
    const normalised = [...bySpelling.keys()];

    const rows =
      normalised.length === 0
        ? []
        : await this.db
            .select({ email: schema.userEmails.emailId, userId: schema.userEmails.userId })
            .from(schema.userEmails)
            .innerJoin(schema.users, eq(schema.users.id, schema.userEmails.userId))
            .where(
              and(inArray(sql`lower(${schema.userEmails.emailId})`, normalised), isNotNull(schema.userEmails.verifiedAt), inArray(schema.users.status, [...RESOLVABLE_STATUSES])),
            );

    const resolved = rows.map(row => ({ email: bySpelling.get(row.email.toLowerCase()) ?? row.email, userId: row.userId.toString() }));
    await this.auditService.record({
      action: 'directory.users.resolve',
      outcome: 'SUCCESS',
      actorType: 'SERVICE_ACCOUNT',
      actorId: callerClientId,
      detail: { requested: normalised.length, resolved: resolved.length },
    });

    this.logger.debug('directory resolve handled', { callerClientId, requested: normalised.length, resolved: resolved.length });
    return resolved;
  }

  async lookupByUserId(userIds: string[], callerClientId: string): Promise<DirectoryUser[]> {
    const shapely = userIds.filter(userId => REGEX.ID.test(userId) && userId.length <= MAX_ID_DIGITS);

    const rows =
      shapely.length === 0
        ? []
        : await this.db
            .select({
              userId: schema.users.id,
              displayName: schema.userProfiles.displayName,
              firstName: schema.userProfiles.firstName,
              lastName: schema.userProfiles.lastName,
            })
            .from(schema.users)
            /** Left-joined: an account with no profile row still resolves, just without a name to show. */
            .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
            .where(and(inArray(schema.users.id, shapely.map(BigInt)), inArray(schema.users.status, [...RESOLVABLE_STATUSES])));

    const users = rows.map(row => ({
      userId: row.userId.toString(),
      displayName: row.displayName ?? undefined,
      firstName: row.firstName ?? undefined,
      lastName: row.lastName ?? undefined,
    }));
    await this.auditService.record({
      action: 'directory.users.lookup',
      outcome: 'SUCCESS',
      actorType: 'SERVICE_ACCOUNT',
      actorId: callerClientId,
      detail: { requested: shapely.length, resolved: users.length },
    });

    this.logger.debug('directory lookup handled', { callerClientId, requested: shapely.length, resolved: users.length });
    return users;
  }

  async isOrganisationMember(organisationId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ organisationId: schema.organisationMembers.organisationId })
      .from(schema.organisationMembers)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.organisationMembers.organisationId))
      .where(
        and(
          eq(schema.organisationMembers.organisationId, BigInt(organisationId)),
          eq(schema.organisationMembers.userId, BigInt(userId)),
          eq(schema.organisationMembers.status, 'ACTIVE'),
          eq(schema.organisations.status, 'ACTIVE'),
        ),
      );
    return !!row;
  }
}
