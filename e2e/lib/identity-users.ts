import { randomBytes } from 'node:crypto';

import { deletePulseNotificationsTo, identityDb } from './db';
import { PERSONAS } from './personas';
import { deleteAuthFlowsFor, redisDel } from './redis';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'DISABLED' | 'BLOCKED' | 'SUSPENDED' | 'CLOSED';

export type UserLockMode = 'NONE' | 'OTP_ONLY' | 'FULL';

export interface IdentityUserOptions {
  /** Readable tag embedded in the generated email, e.g. `login-lock`. */
  label?: string;
  firstName?: string;
  lastName?: string;
  status?: UserStatus;
  statusUntil?: Date;
  lockMode?: UserLockMode;
  /** Defaults to one year ahead when `lockMode` is not `NONE`. */
  lockedUntil?: Date;
  passwordResetRequired?: boolean;
  /** Default true. An unverified primary email is what a half-finished registration leaves behind. */
  emailVerified?: boolean;
  /** Default true. False creates a passwordless account (no PASSWORD identity or hash). */
  withPassword?: boolean;
  /** Sign-in username (3–32 of letters, digits, `.`, `_`, `-`); unique across users. */
  username?: string;
  /** E.164 number stored as the primary phone. */
  phone?: string;
  phoneVerified?: boolean;
}

export interface IdentityUser {
  readonly userId: string;
  /** The OIDC `sub`, which identity mints as the bare decimal user id. */
  readonly sub: string;
  readonly email: string;
  /** The plaintext behind the copied hash; meaningless when the user was created without a password. */
  readonly password: string;
  readonly personalOrgId: string;
  readonly phone?: string;
  readonly username?: string;
}

export type IdentityUserRef = Pick<IdentityUser, 'userId' | 'email' | 'phone'> & { readonly personalOrgId: string | null };

export interface FederatedLinkOptions {
  /** Default false. Identity ignores a link whose provider is inactive. */
  isActive?: boolean;
}

export interface FederatedLink {
  readonly identityProviderId: string;
  readonly subject: string;
}

/**
 * Creates identity users straight in the database, writing the rows password registration does (user, profile, primary email, PASSWORD identity + argon2id hash +
 * `password_history`, personal organisation with an OWNER membership) without spending the 5/hour `register-init` budget or an OTP round-trip.
 * Specs run under node, which has no argon2, so the hash is copied from a seeded persona and every factory user signs in with that persona's password.
 * The source is `locked` because no spec changes its password: `account.spec.ts` rotates `user1`'s mid-run, and a hash copied in that window would sign nobody in.
 */

const HASH_SOURCE = PERSONAS.locked;

let passwordHash: Promise<string> | undefined;

async function loadPersonaHash(): Promise<string> {
  const rows = await identityDb()<{ hash: string }[]>`
    SELECT up.hash
    FROM user_passwords up
    JOIN user_auth_identities uai ON uai.id = up.user_auth_identity_id
    JOIN user_emails ue ON ue.user_id = uai.user_id
    WHERE uai.provider = 'PASSWORD' AND lower(ue.email_id) = ${HASH_SOURCE.email.toLowerCase()} AND up.algorithm = 'ARGON2ID'
  `;
  const hash = rows[0]?.hash;
  if (!hash) throw new Error(`No ARGON2ID hash for ${HASH_SOURCE.email}; run the seed before creating factory users`);
  return hash;
}

function copiedPasswordHash(): Promise<string> {
  passwordHash ??= loadPersonaHash().catch(error => {
    passwordHash = undefined;
    throw error;
  });
  return passwordHash;
}

export function uniqueEmail(label = 'user'): string {
  return `e2e.${label}.${Date.now().toString(36)}${randomBytes(3).toString('hex')}@shadow-apps.test`;
}

export async function createIdentityUser(options: IdentityUserOptions = {}): Promise<IdentityUser> {
  const sql = identityDb();
  const email = uniqueEmail(options.label);
  const lockMode = options.lockMode ?? 'NONE';
  const lockedUntil = lockMode === 'NONE' ? null : (options.lockedUntil ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  const withPassword = options.withPassword ?? true;
  const hash = withPassword ? await copiedPasswordHash() : null;

  return sql.begin(async tx => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (status, status_until, lock_mode, locked_until, password_reset_required, username)
      VALUES (
        ${options.status ?? 'ACTIVE'}::user_status, ${options.statusUntil ?? null}, ${lockMode}::user_lock_mode, ${lockedUntil}, ${options.passwordResetRequired ?? false},
        ${options.username ?? null}
      )
      RETURNING id
    `;
    if (!user) throw new Error('user insert returned no row');
    const userId = user.id;

    await tx`INSERT INTO user_profiles (user_id, first_name, last_name) VALUES (${userId}, ${options.firstName ?? 'E2E'}, ${options.lastName ?? 'Factory'})`;
    await tx`INSERT INTO user_emails (user_id, email_id, is_primary, verified_at) VALUES (${userId}, ${email}, true, ${(options.emailVerified ?? true) ? new Date() : null})`;
    if (options.phone) {
      await tx`INSERT INTO user_phones (user_id, phone_number, is_primary, verified_at) VALUES (${userId}, ${options.phone}, true, ${options.phoneVerified ? new Date() : null})`;
    }

    if (hash) {
      const [identity] = await tx<{ id: string }[]>`INSERT INTO user_auth_identities (user_id, provider, provider_key) VALUES (${userId}, 'PASSWORD', ${email}) RETURNING id`;
      if (!identity) throw new Error('auth identity insert returned no row');
      await tx`INSERT INTO user_passwords (user_auth_identity_id, hash, algorithm, version) VALUES (${identity.id}, ${hash}, 'ARGON2ID', 1)`;
      await tx`INSERT INTO password_history (user_id, hash) VALUES (${userId}, ${hash})`;
    }

    const [org] = await tx<{ id: string }[]>`
      INSERT INTO organisations (slug, name, type, status) VALUES (${`e2e-personal-${userId}`}, ${'E2E Factory Workspace'}, 'PERSONAL', 'ACTIVE') RETURNING id
    `;
    if (!org) throw new Error('organisation insert returned no row');
    await tx`INSERT INTO organisation_members (organisation_id, user_id, role, is_default) VALUES (${org.id}, ${userId}, 'OWNER', true)`;
    await tx`UPDATE users SET personal_organisation_id = ${org.id} WHERE id = ${userId}`;

    return {
      userId,
      sub: userId,
      email,
      password: HASH_SOURCE.password,
      personalOrgId: org.id,
      ...(options.phone ? { phone: options.phone } : {}),
      ...(options.username ? { username: options.username } : {}),
    };
  });
}

/**
 * Removes a factory or API-registered user: the user row (sessions, credentials, emails, memberships cascade), the sign-in events and verification challenges that
 * outlive it, notifications queued or delivered to its addresses, unfinished auth flows, its personal organisation, its Redis session-hash set and OTP counters.
 * Idempotent, so safe in a teardown after a failed create or a spec that already deleted the user.
 */
export async function deleteIdentityUser(user: IdentityUserRef): Promise<void> {
  const sql = identityDb();
  const held = await sql<{ target: string }[]>`
    SELECT lower(email_id) AS target FROM user_emails WHERE user_id = ${user.userId}
    UNION SELECT phone_number FROM user_phones WHERE user_id = ${user.userId}
  `;
  const targets = [...new Set([user.email.toLowerCase(), ...(user.phone ? [user.phone] : []), ...held.map(row => row.target)])];
  await sql`DELETE FROM user_sign_in_events WHERE user_id = ${user.userId}`;
  await sql`DELETE FROM verification_challenges WHERE user_id = ${user.userId} OR lower(target) IN ${sql(targets)}`;
  await deleteOutboxTo(targets);
  await deletePulseNotificationsTo(targets);
  await sql`DELETE FROM users WHERE id = ${user.userId}`;
  await deleteAuthFlowsFor(targets);
  if (user.personalOrgId) await sql`DELETE FROM organisations WHERE id = ${user.personalOrgId} AND type = 'PERSONAL'`;
  await redisDel(`user_sessions:${user.userId}`, ...targets.map(target => `rl:otp-ident:${target}`));
}

/** `recipients` is read through `#>> '{}'` because rows written under prepared statements hold it as a JSON string, not an object. */
async function deleteOutboxTo(targets: readonly string[]): Promise<void> {
  const sql = identityDb();
  await sql`
    DELETE FROM notification_outbox
    WHERE lower((recipients #>> '{}')::jsonb ->> 'email') IN ${sql(targets as string[])} OR (recipients #>> '{}')::jsonb ->> 'phone' IN ${sql(targets as string[])}
  `;
}

/** What a registration for `email` leaves behind besides a user: its challenges, its Redis flows, its outbox rows, what pulse delivered from them and its OTP throttle key. */
export async function deleteRegistrationAttempt(email: string): Promise<void> {
  const sql = identityDb();
  const target = email.toLowerCase();
  await sql`DELETE FROM verification_challenges WHERE lower(target) = ${target} AND user_id IS NULL`;
  await deleteOutboxTo([target]);
  await deletePulseNotificationsTo([target]);
  await deleteAuthFlowsFor([target]);
  await redisDel(`rl:otp-ident:${target}`);
}

/** The user whose primary email is `email`, e.g. one a spec registered through the API. */
export async function findIdentityUserByEmail(email: string): Promise<IdentityUserRef | undefined> {
  const [row] = await identityDb()<{ userId: string; personalOrgId: string | null }[]>`
    SELECT u.id::text AS "userId", u.personal_organisation_id::text AS "personalOrgId"
    FROM users u JOIN user_emails ue ON ue.user_id = u.id
    WHERE lower(ue.email_id) = ${email.toLowerCase()} AND ue.is_primary
  `;
  return row ? { ...row, email } : undefined;
}

/**
 * Links `user` to an upstream subject on an OIDC provider owned by the user's personal organisation (it goes with that organisation), the state a federated sign-in leaves.
 * Inactive unless `isActive` says otherwise; identity requires an active one before it starts a federated step-up.
 */
export async function linkFederatedIdentity(user: Pick<IdentityUser, 'userId' | 'personalOrgId'>, options: FederatedLinkOptions = {}): Promise<FederatedLink> {
  const sql = identityDb();
  const issuer = `https://idp-${randomBytes(4).toString('hex')}.example.test`;
  const subject = `e2e-${randomBytes(8).toString('hex')}`;
  return sql.begin(async tx => {
    const [provider] = await tx<{ id: string }[]>`
      INSERT INTO identity_providers (
        organisation_id, kind, name, issuer, client_id, authorization_endpoint, token_endpoint, jwks_uri, is_active
      )
      VALUES (
        ${user.personalOrgId}, 'OIDC', 'E2E Upstream', ${issuer}, 'e2e-client',
        ${`${issuer}/authorize`}, ${`${issuer}/token`}, ${`${issuer}/jwks`}, ${options.isActive ?? false}
      )
      RETURNING id
    `;
    if (!provider) throw new Error('identity provider insert returned no row');
    await tx`INSERT INTO federated_identities (identity_provider_id, user_id, subject) VALUES (${provider.id}, ${user.userId}, ${subject})`;
    return { identityProviderId: provider.id, subject };
  });
}
