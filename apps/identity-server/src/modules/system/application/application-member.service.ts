/**
 * Importing npm packages
 */
import { and, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { Application, DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface ApplicationMemberRow {
  userId: bigint;
  username: string | null;
  primaryEmail: string | null;
  firstUsedAt: Date;
  lastUsedAt: Date;
}

export interface UserApplicationRow {
  id: number;
  name: string;
  displayName: string | null;
  subDomain: string;
  isActive: boolean;
  firstUsedAt: Date;
  lastUsedAt: Date;
}

/**
 * Declaring the constants
 *
 * Application membership is the per-user, per-application record provisioned on a user's first
 * consent grant for the application (see ConsentService). It is deliberately NOT a service account:
 * "service account" in this system is an M2M SERVICE OAuth client (D-2). This is a human's usage
 * link, the anchor products attach default roles and state to.
 */

@Injectable()
export class ApplicationMemberService {
  private readonly logger = Logger.getLogger(APP_NAME, ApplicationMemberService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** Provisions a membership on first use, or refreshes `last_used_at` on later grants — idempotent. */
  async ensureMembership(applicationId: number, userId: bigint): Promise<void> {
    await this.db
      .insert(schema.applicationMembers)
      .values({ applicationId, userId })
      .onConflictDoUpdate({ target: [schema.applicationMembers.applicationId, schema.applicationMembers.userId], set: { lastUsedAt: new Date() } });
    this.logger.debug('Application membership ensured', { applicationId, userId });
  }

  async getMembership(applicationId: number, userId: bigint): Promise<Application.Member | null> {
    const membership = await this.db.query.applicationMembers.findFirst({
      where: and(eq(schema.applicationMembers.applicationId, applicationId), eq(schema.applicationMembers.userId, userId)),
    });
    return membership ?? null;
  }

  /** Removes a user's membership; returns false when there was nothing to remove. */
  async removeMembership(applicationId: number, userId: bigint): Promise<boolean> {
    const removed = await this.db
      .delete(schema.applicationMembers)
      .where(and(eq(schema.applicationMembers.applicationId, applicationId), eq(schema.applicationMembers.userId, userId)))
      .returning({ userId: schema.applicationMembers.userId });
    return removed.length > 0;
  }

  /** Members of an application, enriched with a display identifier (primary email resolved in a batch). */
  async listMembers(applicationId: number): Promise<ApplicationMemberRow[]> {
    const rows = await this.db
      .select({
        userId: schema.applicationMembers.userId,
        username: schema.users.username,
        firstUsedAt: schema.applicationMembers.firstUsedAt,
        lastUsedAt: schema.applicationMembers.lastUsedAt,
      })
      .from(schema.applicationMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.applicationMembers.userId))
      .where(eq(schema.applicationMembers.applicationId, applicationId))
      .orderBy(schema.applicationMembers.firstUsedAt);

    const userIds = rows.map(row => row.userId);
    const emails = userIds.length
      ? await this.db
          .select()
          .from(schema.userEmails)
          .where(and(inArray(schema.userEmails.userId, userIds), eq(schema.userEmails.isPrimary, true)))
      : [];
    const primaryByUser = new Map(emails.map(email => [email.userId, email.emailId]));

    return rows.map(row => ({ ...row, primaryEmail: primaryByUser.get(row.userId) ?? null }));
  }

  /** Applications the user has used, most-recently-used first. */
  async listApplicationsForUser(userId: bigint): Promise<UserApplicationRow[]> {
    return this.db
      .select({
        id: schema.applications.id,
        name: schema.applications.name,
        displayName: schema.applications.displayName,
        subDomain: schema.applications.subDomain,
        isActive: schema.applications.isActive,
        firstUsedAt: schema.applicationMembers.firstUsedAt,
        lastUsedAt: schema.applicationMembers.lastUsedAt,
      })
      .from(schema.applicationMembers)
      .innerJoin(schema.applications, eq(schema.applications.id, schema.applicationMembers.applicationId))
      .where(eq(schema.applicationMembers.userId, userId))
      .orderBy(schema.applicationMembers.lastUsedAt);
  }
}
