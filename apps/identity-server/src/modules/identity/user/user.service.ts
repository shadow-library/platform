/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, MaybeNull } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { SQL, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatastoreService, ID, OpResult, PrimaryDatabase, User, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface CreateUser {
  username?: string;
  status?: User.Status;
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

  constructor(private readonly datastoreService: DatastoreService) {
    this.db = datastoreService.getPrimaryDatabase();
  }

  private buildWhereClause(identifier: ID): FindUserFilter {
    if (typeof identifier === 'bigint' || /^\d{12,}$/.test(identifier)) return { table: 'users', sql: eq(schema.users.id, BigInt(identifier)) };
    else if (identifier.startsWith('+')) return { table: 'userPhones', sql: eq(schema.userPhones.phoneNumber, identifier) };
    else if (identifier.includes('@')) return { table: 'userEmails', sql: eq(schema.userEmails.emailId, identifier.toLowerCase()) };
    else return { table: 'users', sql: eq(schema.users.username, identifier) };
  }

  async createUserWithPassword(data: CreateUser): Promise<UserDetails> {
    const user = await this.db
      .transaction(async tx => {
        const [user] = await tx.insert(schema.users).values({ username: data.username, status: data.status }).returning();
        assert(user, 'User creation failed');
        this.logger.debug('user created', { userId: user.id });
        const userDetails: UserDetails = { ...user, emails: [], phones: [], profile: null, authIdentities: [] };

        const profileData = { userId: user.id, ...data, dateOfBirth: data.dateOfBirth?.toISOString() };
        const [profile] = await tx.insert(schema.userProfiles).values(profileData).returning();
        assert(profile, 'User profile creation failed');
        this.logger.debug('user profile created', { userId: user.id });
        userDetails.profile = profile;

        const emailId = data.email.toLowerCase();
        const [email] = await tx.insert(schema.userEmails).values({ userId: user.id, emailId, isPrimary: true, isVerified: data.emailVerified }).returning();
        assert(email, 'User email creation failed');
        this.logger.debug('user email created', { userId: user.id, emailId });
        userDetails.emails.push(email);

        if (data.phoneNumber) {
          const [phone] = await tx
            .insert(schema.userPhones)
            .values({ userId: user.id, phoneNumber: data.phoneNumber, isPrimary: true, isVerified: data.phoneVerified })
            .returning();
          assert(phone, 'User phone creation failed');
          this.logger.debug('user phone created', { userId: user.id, phoneNumber: data.phoneNumber });
          userDetails.phones.push(phone);
        }

        const [authIdentity] = await tx.insert(schema.userAuthIdentities).values({ userId: user.id, provider: 'PASSWORD', providerKey: email.emailId }).returning();
        assert(authIdentity, 'User auth identity creation failed');
        this.logger.debug('user auth identity created', { userId: user.id, authIdentityId: authIdentity.id });
        userDetails.authIdentities.push(authIdentity);

        const passwordHash = await Bun.password.hash(data.password, { algorithm: 'argon2id' });
        const [password] = await tx.insert(schema.userPasswords).values({ userAuthIdentityId: authIdentity.id, algorithm: 'ARGON2ID', hash: passwordHash }).returning();
        assert(password, 'User password creation failed');
        this.logger.debug('user password created', { userId: user.id, authIdentityId: password.userAuthIdentityId });

        return userDetails;
      })
      .catch(error => this.datastoreService.translateError(error));

    this.logger.info('new user created', { userId: user.id });
    this.logger.debug('created user details', { user });
    return user;
  }

  async getUser(identifier: ID): Promise<User | null> {
    const filter = this.buildWhereClause(identifier);
    let user: User | undefined;
    if (filter.table === 'users') user = await this.db.query.users.findFirst({ where: filter.sql });
    else if (filter.table === 'userEmails') user = await this.db.query.users.findFirst({ with: { emails: { where: filter.sql } } });
    else if (filter.table === 'userPhones') user = await this.db.query.users.findFirst({ with: { phones: { where: filter.sql } } });
    return user ?? null;
  }

  async updateUserStatus(identifier: ID, status: User.Status): Promise<void> {
    const filter = this.buildWhereClause(identifier);
    const update = this.db.update(schema.users).set({ status });
    let result: OpResult = [];
    if (filter.table === 'users') {
      result = await update
        .where(filter.sql)
        .returning({ id: schema.users.id })
        .catch(error => this.datastoreService.translateError(error));
      this.logger.debug('user status updated using users table', { userId: identifier, status, result });
    } else {
      const table = filter.table === 'userEmails' ? schema.userEmails : schema.userPhones;
      result = await update
        .from(table)
        .where(filter.sql)
        .returning({ id: schema.users.id })
        .catch(error => this.datastoreService.translateError(error));
      this.logger.debug('user status updated using related table', { userId: identifier, status, table: filter.table, result });
    }
    if (result.length === 0) throw new ServerError(AppErrorCode.USR_001);
  }
}
