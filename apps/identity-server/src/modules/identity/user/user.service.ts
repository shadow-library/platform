/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, MaybeNull, ValidationError } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { SQL, and, eq, inArray, isNotNull } from 'drizzle-orm';
import { DateTime } from 'luxon';
import validator from 'validator';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME, ERROR_MESSAGES, REGEX } from '@server/constants';
import { PasswordPolicyService, PasswordService } from '@server/modules/identity/credentials';
import { OrganisationService } from '@server/modules/identity/organisation';
import { DatabaseService, ID, PrimaryDatabase, User, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
}

export interface CreateUser {
  username?: string;
  status?: User.Status;
  /** Seeds the account so the first successful password login is refused until recovery replaces it (T-602). */
  passwordResetRequired?: boolean;
  password: string;

  email: string;
  emailVerified?: boolean;

  phoneNumber?: string;
  phoneVerified?: boolean;

  firstName?: string;
  lastName?: string;
  displayName?: string;
  gender?: User.Gender;
  dateOfBirth?: Date;
  avatarUrl?: string;
}

export interface UserDetails extends User {
  emails: User.Email[];
  phones: User.Phone[];
  profile: MaybeNull<User.Profile>;
  authIdentities: User.AuthIdentity[];
}

interface FindUserFilter {
  table: 'users' | 'userEmails' | 'userPhones';
  sql: SQL;
}

/**
 * Declaring the constants
 */

@Injectable()
export class UserService {
  private readonly logger = Logger.getLogger(APP_NAME, UserService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly organisationService: OrganisationService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Email/phone lookups match only verified rows: with verified-only uniqueness (DB §2), an
   * unverified claim by another account must never capture a login or recovery identifier.
   */
  private buildWhereClause(identifier: ID): FindUserFilter {
    if (typeof identifier === 'bigint' || /^\d{12,}$/.test(identifier)) return { table: 'users', sql: eq(schema.users.id, BigInt(identifier)) };
    else if (identifier.startsWith('+')) return { table: 'userPhones', sql: and(eq(schema.userPhones.phoneNumber, identifier), isNotNull(schema.userPhones.verifiedAt)) as SQL };
    else if (identifier.includes('@'))
      return { table: 'userEmails', sql: and(eq(schema.userEmails.emailId, identifier.toLowerCase()), isNotNull(schema.userEmails.verifiedAt)) as SQL };
    else return { table: 'users', sql: eq(schema.users.username, identifier) };
  }

  /**
   * Resolves an identifier filter to a condition on `users.id`. For email/phone lookups the
   * predicate must select the matching user id from the child table: a Drizzle relational
   * `with.where` filters the joined child rows, not the parent, so it would silently match the
   * first user in the table.
   */
  private resolveUserCondition(filter: FindUserFilter): SQL {
    if (filter.table === 'users') return filter.sql;
    const table = filter.table === 'userEmails' ? schema.userEmails : schema.userPhones;
    return inArray(schema.users.id, this.db.select({ id: table.userId }).from(table).where(filter.sql));
  }

  async createUserWithPassword(data: CreateUser): Promise<UserDetails> {
    return this.createUser(data);
  }

  /** Creates an account with no local credential — SCIM provisioning and federated JIT sign-up. */
  async createProvisionedUser(data: Omit<CreateUser, 'password'>): Promise<UserDetails> {
    return this.createUser(data);
  }

  private async createUser(data: Omit<CreateUser, 'password'> & { password?: string }): Promise<UserDetails> {
    if (!validator.isEmail(data.email)) throw new ValidationError('email', ERROR_MESSAGES.INVALID_EMAIL);
    if (data.password !== undefined) this.passwordPolicyService.assertStrong(data.password);
    if (data.phoneNumber && !validator.isMobilePhone(data.phoneNumber, 'any', { strictMode: true })) throw new ValidationError('phoneNumber', ERROR_MESSAGES.INVALID_PHONE_NUMBER);
    if (data.username && !REGEX.USERNAME.test(data.username)) throw new ValidationError('username', ERROR_MESSAGES.INVALID_USERNAME);
    if (data.dateOfBirth) {
      const since = DateTime.fromJSDate(data.dateOfBirth).diffNow('years');
      const age = Math.floor(-since.years);
      if (age < 13 || age > 120) throw new ValidationError('dateOfBirth', ERROR_MESSAGES.INVALID_DATE_OF_BIRTH);
    }

    const user = await this.db
      .transaction(async tx => {
        const [user] = await tx.insert(schema.users).values({ username: data.username, status: data.status, passwordResetRequired: data.passwordResetRequired }).returning();
        assert(user, 'User creation failed');
        this.logger.debug('user created', { userId: user.id });
        const userDetails: UserDetails = { ...user, emails: [], phones: [], profile: null, authIdentities: [] };

        const profileData = { userId: user.id, ...data, dateOfBirth: data.dateOfBirth?.toISOString() };
        const [profile] = await tx.insert(schema.userProfiles).values(profileData).returning();
        assert(profile, 'User profile creation failed');
        this.logger.debug('user profile created', { userId: user.id });
        userDetails.profile = profile;

        const emailId = data.email.toLowerCase();
        const [email] = await tx
          .insert(schema.userEmails)
          .values({ userId: user.id, emailId, isPrimary: true, verifiedAt: data.emailVerified ? new Date() : null })
          .returning();
        assert(email, 'User email creation failed');
        this.logger.debug('user email created', { userId: user.id, emailId });
        userDetails.emails.push(email);

        if (data.phoneNumber) {
          const [phone] = await tx
            .insert(schema.userPhones)
            .values({ userId: user.id, phoneNumber: data.phoneNumber, isPrimary: true, verifiedAt: data.phoneVerified ? new Date() : null })
            .returning();
          assert(phone, 'User phone creation failed');
          this.logger.debug('user phone created', { userId: user.id, phoneNumber: data.phoneNumber });
          userDetails.phones.push(phone);
        }

        if (data.password !== undefined) {
          const [authIdentity] = await tx.insert(schema.userAuthIdentities).values({ userId: user.id, provider: 'PASSWORD', providerKey: email.emailId }).returning();
          assert(authIdentity, 'User auth identity creation failed');
          this.logger.debug('user auth identity created', { userId: user.id, authIdentityId: authIdentity.id });
          userDetails.authIdentities.push(authIdentity);

          const { hash: passwordHash, version } = await this.passwordService.hash(data.password);
          const [password] = await tx.insert(schema.userPasswords).values({ userAuthIdentityId: authIdentity.id, algorithm: 'ARGON2ID', hash: passwordHash, version }).returning();
          assert(password, 'User password creation failed');
          await tx.insert(schema.passwordHistory).values({ userId: user.id, hash: passwordHash });
          this.logger.debug('user password created', { userId: user.id, authIdentityId: password.userAuthIdentityId });
        }

        const workspaceName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || 'Personal';
        const organisation = await this.organisationService.createPersonalWorkspace(user.id, `${workspaceName} Workspace`, tx);
        await tx.update(schema.users).set({ personalOrganisationId: organisation.id }).where(eq(schema.users.id, user.id));
        userDetails.personalOrganisationId = organisation.id;
        this.logger.debug('personal workspace created', { userId: user.id, organisationId: organisation.id });

        return userDetails;
      })
      .catch(error => this.databaseService.translateError(error));

    this.logger.info('new user created', { userId: user.id });
    this.logger.debug('created user details', { user });
    return user;
  }

  async getUser(identifier: ID): Promise<User | null> {
    const condition = this.resolveUserCondition(this.buildWhereClause(identifier));
    const user = await this.db.query.users.findFirst({ where: condition });
    return user ?? null;
  }

  async updateUserStatus(identifier: ID, status: User.Status): Promise<void> {
    const condition = this.resolveUserCondition(this.buildWhereClause(identifier));
    const result = await this.db
      .update(schema.users)
      .set({ status, updatedAt: new Date() })
      .where(condition)
      .returning({ id: schema.users.id })
      .catch(error => this.databaseService.translateError(error));
    if (result.length === 0) throw new ServerError(AppErrorCode.USR_001);
    this.logger.debug('user status updated', { identifier, status, count: result.length });
  }

  /** Updates the signed-in user's own profile fields; a no-op when nothing changed. */
  async updateProfile(userId: bigint, data: ProfileUpdate): Promise<void> {
    const update: ProfileUpdate = {};
    if (data.firstName !== undefined) update.firstName = data.firstName;
    if (data.lastName !== undefined) update.lastName = data.lastName;
    if (Object.keys(update).length === 0) return;
    await this.db.update(schema.userProfiles).set(update).where(eq(schema.userProfiles.userId, userId));
    this.logger.debug('user profile updated', { userId });
  }
}
