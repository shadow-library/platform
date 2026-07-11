/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

type OrgWriter = Pick<PrimaryDatabase, 'insert'>;

/**
 * Declaring the constants
 */

@Injectable()
export class OrganisationService {
  private readonly logger = Logger.getLogger(APP_NAME, OrganisationService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Creates a user's synthetic personal workspace and its owner membership (D-1). Accepts the
   * surrounding transaction so the workspace is committed atomically with the user.
   */
  async createPersonalWorkspace(userId: bigint, name: string, executor: OrgWriter = this.db): Promise<Organisation> {
    const [organisation] = await executor.insert(schema.organisations).values({ name, type: 'PERSONAL', status: 'ACTIVE' }).returning();
    if (!organisation) throw new Error('Failed to create personal workspace');
    await executor.insert(schema.organisationMembers).values({ organisationId: organisation.id, userId, role: 'OWNER', isDefault: true });
    return organisation;
  }

  async getMembership(userId: bigint, organisationId: bigint): Promise<Organisation.Member | null> {
    const membership = await this.db.query.organisationMembers.findFirst({
      where: and(eq(schema.organisationMembers.userId, userId), eq(schema.organisationMembers.organisationId, organisationId)),
    });
    return membership ?? null;
  }

  /** Throws unless the user is a member of the organisation; the guard for every org-scoped read. */
  async assertMember(userId: bigint, organisationId: bigint): Promise<Organisation.Member> {
    const membership = await this.getMembership(userId, organisationId);
    if (!membership) throw new ServerError(AppErrorCode.ORG_001);
    return membership;
  }

  /** Lists the members of an organisation, but only for a caller who belongs to it (tenant scope). */
  async listMembers(callerUserId: bigint, organisationId: bigint): Promise<Organisation.Member[]> {
    await this.assertMember(callerUserId, organisationId);
    return this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, organisationId) });
  }

  async listMembershipsForUser(userId: bigint): Promise<Organisation.Member[]> {
    return this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.userId, userId) });
  }

  async getById(organisationId: bigint): Promise<Organisation | null> {
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId) });
    return organisation ?? null;
  }
}
