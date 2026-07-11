/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, pgEnum, pgTable, primaryKey, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { users } from './users.schema';

/**
 * Defining types
 */

export type Organisation = InferSelectModel<typeof organisations>;

export namespace Organisation {
  export type Member = InferSelectModel<typeof organisationMembers>;
  export type Invitation = InferSelectModel<typeof organisationInvitations>;
  export type Domain = InferSelectModel<typeof organisationDomains>;

  export type Type = InferEnum<typeof organisationType>;
  export type Status = InferEnum<typeof organisationStatus>;
  export type MemberRole = InferEnum<typeof organisationMemberRole>;
  export type DomainStatus = InferEnum<typeof organisationDomainStatus>;
}

/**
 * Declaring the constants
 */

export const organisationType = pgEnum('organisation_type', ['PERSONAL', 'TEAM']);
export const organisationStatus = pgEnum('organisation_status', ['ACTIVE', 'SUSPENDED', 'DELETED']);
export const organisationMemberRole = pgEnum('organisation_member_role', ['OWNER', 'ADMIN', 'MEMBER']);
export const organisationDomainStatus = pgEnum('organisation_domain_status', ['PENDING', 'VERIFIED', 'FAILED']);

export const organisations = pgTable('organisations', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  type: organisationType('type').notNull().default('TEAM'),
  status: organisationStatus('status').notNull().default('ACTIVE'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organisationMembers = pgTable(
  'organisation_members',
  {
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
    role: organisationMemberRole('role').notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.organisationId, t.userId] })],
);

/**
 * A pending invitation is one with no accepted/declined/revoked timestamp; the partial unique
 * index keeps at most one live invitation per (organisation, email) while history rows remain.
 * Tokens are stored as SHA-256 hashes — the plaintext travels only in the invitation email.
 */
export const organisationInvitations = pgTable(
  'organisation_invitations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    role: organisationMemberRole('role').notNull().default('MEMBER'),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    invitedBy: bigint('invited_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('organisation_invitations_pending_unique')
      .on(t.organisationId, t.email)
      .where(sql`${t.acceptedAt} IS NULL AND ${t.declinedAt} IS NULL AND ${t.revokedAt} IS NULL`),
    index('organisation_invitations_email_idx').on(t.email),
  ],
);

/**
 * DNS-TXT-proven domain ownership (T-703). A domain may be VERIFIED by at most one organisation
 * at a time (partial unique index); PENDING claims may coexist so a domain moving between orgs
 * never needs the old row deleted first. Verification evidence (checked time, matched record) is
 * retained for audit. SAML/SCIM/JIT-provisioning attach to VERIFIED domains in later milestones.
 */
export const organisationDomains = pgTable(
  'organisation_domains',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    domain: varchar('domain', { length: 253 }).notNull(),
    verificationToken: varchar('verification_token', { length: 64 }).notNull(),
    status: organisationDomainStatus('status').notNull().default('PENDING'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    matchedRecord: varchar('matched_record', { length: 512 }),
    lastCheckError: varchar('last_check_error', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('organisation_domains_org_domain_unique').on(t.organisationId, t.domain),
    uniqueIndex('organisation_domains_verified_unique')
      .on(t.domain)
      .where(sql`${t.status} = 'VERIFIED'`),
  ],
);

/**
 * Declaring the relations
 */

export const organisationRelations = relations(organisations, ({ many }) => ({
  members: many(organisationMembers),
  invitations: many(organisationInvitations),
}));

export const organisationInvitationRelations = relations(organisationInvitations, ({ one }) => ({
  organisation: one(organisations, { fields: [organisationInvitations.organisationId], references: [organisations.id] }),
}));

export const organisationMemberRelations = relations(organisationMembers, ({ one }) => ({
  organisation: one(organisations, { fields: [organisationMembers.organisationId], references: [organisations.id] }),
  user: one(users, { fields: [organisationMembers.userId], references: [users.id] }),
}));
