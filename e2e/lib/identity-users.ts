/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { identityDb } from './db';
import { PERSONAS } from './personas';
import { redisDel } from './redis';

/**
 * Defining types
 */

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
}

export type IdentityUserRef = Pick<IdentityUser, 'userId' | 'email' | 'phone'> & { readonly personalOrgId: string | null };

export interface FederatedLink {
  readonly identityProviderId: string;
  readonly subject: string;
}

/**
 * Declaring the constants
 *
 * Creates identity users straight in the database, writing the same rows password registration does (user, profile, primary
 * email, PASSWORD identity + argon2id hash + its `password_history` row, personal organisation with an OWNER membership). Registration itself spends the
 * 5/hour `register-init` budget and needs an OTP round-trip; this costs a few inserts. Specs run under node, which has no argon2,
 * so the hash is copied from a seeded persona — every factory user therefore signs in with that persona's password. The source is
 * the `locked` persona because no spec ever changes its password: `account.spec.ts` changes `user1`'s mid-run, and a hash copied
 * inside that window would sign nobody in.
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

/** A unique, unmistakably synthetic `.test` address. */
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

    return { userId, sub: userId, email, password: HASH_SOURCE.password, personalOrgId: org.id, ...(options.phone ? { phone: options.phone } : {}) };
  });
}

/**
 * Removes a factory or API-registered user: the user row (its sessions, credentials, emails, memberships and the rest cascade), the
 * sign-in events and verification challenges that outlive it, its personal organisation, identity's Redis set of its session
 * hashes and its per-identifier OTP counters. Idempotent, so it is safe in a teardown that may run after a failed create or a spec
 * that already deleted the user through the API.
 */
export async function deleteIdentityUser(user: IdentityUserRef): Promise<void> {
  const sql = identityDb();
  const targets = [user.email.toLowerCase(), ...(user.phone ? [user.phone] : [])];
  await sql`DELETE FROM user_sign_in_events WHERE user_id = ${user.userId}`;
  await sql`DELETE FROM verification_challenges WHERE user_id = ${user.userId} OR lower(target) IN ${sql(targets)}`;
  await sql`DELETE FROM users WHERE id = ${user.userId}`;
  if (user.personalOrgId) await sql`DELETE FROM organisations WHERE id = ${user.personalOrgId} AND type = 'PERSONAL'`;
  await redisDel(`user_sessions:${user.userId}`, ...targets.map(target => `rl:otp-ident:${target}`));
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
 * Links `user` to an upstream subject on an inactive OIDC provider owned by the user's personal organisation, the state a federated
 * sign-in leaves behind. The provider never routes or signs anyone in, and it goes with the personal organisation.
 */
export async function linkFederatedIdentity(user: Pick<IdentityUser, 'userId' | 'personalOrgId'>): Promise<FederatedLink> {
  const sql = identityDb();
  const issuer = `https://idp-${randomBytes(4).toString('hex')}.example.test`;
  const subject = `e2e-${randomBytes(8).toString('hex')}`;
  return sql.begin(async tx => {
    const [provider] = await tx<{ id: string }[]>`
      INSERT INTO identity_providers (
        organisation_id, kind, name, issuer, client_id, client_secret_ciphertext, client_secret_iv, client_secret_auth_tag,
        authorization_endpoint, token_endpoint, jwks_uri, is_active
      )
      VALUES (
        ${user.personalOrgId}, 'OIDC', 'E2E Upstream', ${issuer}, 'e2e-client', 'unused', 'unused', 'unused',
        ${`${issuer}/authorize`}, ${`${issuer}/token`}, ${`${issuer}/jwks`}, false
      )
      RETURNING id
    `;
    if (!provider) throw new Error('identity provider insert returned no row');
    await tx`INSERT INTO federated_identities (identity_provider_id, user_id, subject) VALUES (${provider.id}, ${user.userId}, ${subject})`;
    return { identityProviderId: provider.id, subject };
  });
}
