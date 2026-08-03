/**
 * Importing npm packages
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** Every seeded identity persona — the three that receive a saved browser session plus the two negative-path accounts. */
export type Persona = 'user1' | 'user2' | 'admin' | 'locked' | 'suspended';

/** The personas `auth.setup.ts` logs in and saves a `storageState` for; only these are usable as an authenticated context. */
export type LoginPersona = 'user1' | 'user2' | 'admin';

export interface PersonaAccount {
  readonly key: Persona;
  readonly email: string;
  readonly password: string;
  /** Desired `users.status` — `SUSPENDED` exists so a spec can assert the blocked-login path (AUTH_010). */
  readonly status: 'ACTIVE' | 'SUSPENDED';
  /** Desired `users.lock_mode` — `FULL` (with a future `locked_until`) drives the locked-account path. */
  readonly lockMode: 'NONE' | 'FULL';
  readonly firstName: string;
  readonly lastName: string;
  /** True for the personas `auth.setup.ts` establishes a session for; the negative-path accounts never log in. */
  readonly hasStorageState: boolean;
}

/** One entry of `seed-manifest.json` — the identity ids the seed computed, so a spec never has to guess a `sub`. */
export interface SeedManifestUser {
  /** The `users.id` bigint, as a decimal string (the wire form Postgres returns for int8). */
  readonly userId: string;
  /** The OIDC `sub` this user presents to every app — identity mints it as the bare decimal user id (no `usr_` prefix). */
  readonly sub: string;
  readonly email: string;
}

export interface SeedManifest {
  readonly generatedAt: string;
  readonly users: Record<Persona, SeedManifestUser>;
  readonly webNovel: {
    readonly publicSlug: string;
    readonly restrictedSlug: string;
  };
}

/**
 * Declaring the constants
 *
 * The seed and the specs share one source of truth for who the test users are and what they can sign in with.
 * The password satisfies identity's policy (≥12 chars, upper + lower + number) so a seeded hash is accepted by a
 * real login exactly as a registered one would be. `.test`-domain emails keep these accounts unmistakably
 * synthetic and outside any real address space.
 */

/** Shared password for the four seeded `.test` personas — meets identity's ≥12-char upper/lower/number policy. */
export const E2E_PERSONA_PASSWORD = 'E2eSeed#Passw0rd!';

/** Password the seed forces onto the bootstrap admin (id 1) so the suite has a working admin despite the unknown boot secret. */
export const E2E_ADMIN_PASSWORD = 'E2eAdmin#Passw0rd!';

/** The bootstrap admin's well-known email (identity's default `AUTH_BOOTSTRAP_ADMIN_EMAIL`); it already holds IAMAdmin + PulseAdmin. */
export const ADMIN_EMAIL = 'admin@shadow-apps.com';

/** The directory Playwright storage states and the seed manifest live in — gitignored, produced by the seed + setup project. */
export const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

/** Where the seed writes the computed ids the specs read back. */
export const SEED_MANIFEST_PATH = path.join(AUTH_DIR, 'seed-manifest.json');

export const PERSONAS: Record<Persona, PersonaAccount> = {
  user1: {
    key: 'user1',
    email: 'e2e.user1@shadow-apps.test',
    password: E2E_PERSONA_PASSWORD,
    status: 'ACTIVE',
    lockMode: 'NONE',
    firstName: 'E2E',
    lastName: 'UserOne',
    hasStorageState: true,
  },
  user2: {
    key: 'user2',
    email: 'e2e.user2@shadow-apps.test',
    password: E2E_PERSONA_PASSWORD,
    status: 'ACTIVE',
    lockMode: 'NONE',
    firstName: 'E2E',
    lastName: 'UserTwo',
    hasStorageState: true,
  },
  admin: { key: 'admin', email: ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD, status: 'ACTIVE', lockMode: 'NONE', firstName: 'Platform', lastName: 'Admin', hasStorageState: true },
  locked: {
    key: 'locked',
    email: 'e2e.locked@shadow-apps.test',
    password: E2E_PERSONA_PASSWORD,
    status: 'ACTIVE',
    lockMode: 'FULL',
    firstName: 'E2E',
    lastName: 'Locked',
    hasStorageState: false,
  },
  suspended: {
    key: 'suspended',
    email: 'e2e.suspended@shadow-apps.test',
    password: E2E_PERSONA_PASSWORD,
    status: 'SUSPENDED',
    lockMode: 'NONE',
    firstName: 'E2E',
    lastName: 'Suspended',
    hasStorageState: false,
  },
};

/** Absolute path to `persona`'s saved Playwright storage state (may not exist yet — check before use). */
export function storageStateFor(persona: LoginPersona): string {
  return path.join(AUTH_DIR, `${persona}.json`);
}

/** Reads the seed manifest, throwing a pointed error when the seed hasn't run — a spec that needs a `sub` cannot proceed without it. */
export function readSeedManifest(): SeedManifest {
  if (!existsSync(SEED_MANIFEST_PATH)) throw new Error(`Seed manifest not found at ${SEED_MANIFEST_PATH} — run the seed (bun seed/seed.ts) before a spec that reads it`);
  return JSON.parse(readFileSync(SEED_MANIFEST_PATH, 'utf8')) as SeedManifest;
}

/** Convenience: the OIDC `sub` for `persona`, read from the seed manifest. */
export function subFor(persona: Persona): string {
  return readSeedManifest().users[persona].sub;
}
