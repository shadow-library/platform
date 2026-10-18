import { type Envelope, type Keyring, parseKeyring, SecretBox } from '@shadow-library/common/crypto';

import { AppErrorCode } from '@server/classes';
import { type Credential } from '@server/database';

import { type CatalogTimers } from '@modules/catalog/active-catalog.cache';
import {
  type CredentialRepository,
  type CredentialStatus,
  type KidCount,
  type NewCredential,
  type ReferenceFinder,
  type RevokeOutcome,
  type RewrapCandidate,
  type RewrapResult,
} from '@modules/credentials/credential.repository';
import { credentialContext } from '@modules/credentials/credential.utils';

export const K1 = `k1:${Buffer.alloc(32, 1).toString('base64url')}`;
export const K2 = `k2:${Buffer.alloc(32, 2).toString('base64url')}`;

export const OPENROUTER_SECRET = `sk-or-v1-${'a'.repeat(60)}b2c3`;

export function keyring(value: string = K1): Keyring {
  return parseKeyring(value);
}

export function box(value: string = K1): SecretBox {
  return new SecretBox(keyring(value));
}

export function credentialId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

export class ManualTimers implements CatalogTimers {
  readonly ticks: (() => void)[] = [];
  readonly delays: { delayMs: number; fire: () => void }[] = [];

  every(_intervalMs: number, tick: () => void): () => void {
    this.ticks.push(tick);
    return () => this.ticks.splice(this.ticks.indexOf(tick), 1);
  }

  after(delayMs: number): { elapsed: Promise<void>; cancel: () => void } {
    let fire = (): void => undefined;
    const elapsed = new Promise<void>(resolve => (fire = resolve));
    this.delays.push({ delayMs, fire });
    return { elapsed, cancel: () => undefined };
  }
}

export interface EventRecord {
  credentialId: string;
  action: Credential.Action;
  actor: string;
}

/** Mirrors the unique name, the compare-and-set of `rewrapStale` and the revoke-while-referenced refusal; `published` stands for the active document. */
export class FakeCredentialRepository {
  rows: Credential.Row[] = [];
  events: EventRecord[] = [];
  published: unknown = undefined;
  rewrapLocked = false;
  findByIdCalls = 0;
  failStatuses = false;
  failKidCounts = 0;
  /** Runs between a rewrap's read and its write, as a concurrent rotation would */
  beforeRewrapWrite?: (candidate: RewrapCandidate) => void;

  asRepository(): CredentialRepository {
    return this as unknown as CredentialRepository;
  }

  async seed(id: string, plaintext: string, overrides: Partial<Credential.Row> = {}, secretBox: SecretBox = box()): Promise<Credential.Row> {
    const secret = await secretBox.seal(plaintext, credentialContext(id));
    const row: Credential.Row = {
      id,
      name: `credential-${this.rows.length + 1}`,
      secret,
      allowedOrigin: 'https://openrouter.ai',
      hint: 'sk-or-…b2c3',
      version: 1,
      createdBy: 'admin-1',
      createdAt: new Date('2026-10-18T00:00:00.000Z'),
      rotatedAt: null,
      revokedAt: null,
      ...overrides,
    };
    this.rows.push(row);
    return row;
  }

  async list(): Promise<Credential.Row[]> {
    return [...this.rows].sort((left, right) => left.name.localeCompare(right.name));
  }

  async findById(id: string): Promise<Credential.Row | undefined> {
    this.findByIdCalls++;
    return this.rows.find(row => row.id === id);
  }

  async findByName(name: string): Promise<Credential.Row | undefined> {
    return this.rows.find(row => row.name === name);
  }

  async statuses(): Promise<CredentialStatus[]> {
    if (this.failStatuses) throw new TypeError('database unreachable');
    return this.rows.map(row => ({ id: row.id, version: row.version, revokedAt: row.revokedAt }));
  }

  async kidCounts(): Promise<KidCount[]> {
    if (this.failKidCounts > 0) {
      this.failKidCounts--;
      throw new TypeError('database unreachable');
    }
    const counts = new Map<string | null, number>();
    for (const row of this.rows) {
      const kid = (row.secret as Partial<Envelope>).kid ?? null;
      counts.set(kid, (counts.get(kid) ?? 0) + 1);
    }
    return [...counts].map(([kid, credentials]) => ({ kid, credentials }));
  }

  async create(values: NewCredential, actor: string): Promise<Credential.Row> {
    if (this.rows.some(row => row.name === values.name)) throw AppErrorCode.CRED_NAME_TAKEN.create();
    return this.insert(values, actor);
  }

  async createIfNameFree(values: NewCredential, actor: string): Promise<Credential.Row | undefined> {
    if (this.rows.some(row => row.name === values.name)) return undefined;
    return this.insert(values, actor);
  }

  async rotate(id: string, secret: Envelope, hint: string, actor: string): Promise<Credential.Row | undefined> {
    const row = this.rows.find(candidate => candidate.id === id && candidate.revokedAt === null);
    if (!row) return undefined;
    Object.assign(row, { secret, hint, version: row.version + 1, rotatedAt: new Date() });
    this.events.push({ credentialId: id, action: 'rotate', actor });
    return { ...row };
  }

  async revoke(id: string, actor: string, findReferences: ReferenceFinder): Promise<RevokeOutcome> {
    const row = this.rows.find(candidate => candidate.id === id);
    if (!row) return { status: 'not_found' };
    if (row.revokedAt) return { status: 'already_revoked', credential: { ...row } };
    const referencedBy = this.published === undefined ? [] : findReferences(this.published);
    if (referencedBy.length > 0) return { status: 'in_use', referencedBy };
    row.revokedAt = new Date();
    this.events.push({ credentialId: id, action: 'revoke', actor });
    return { status: 'revoked', credential: { ...row } };
  }

  async rewrapStale(activeKeyId: string, rewrap: (candidate: RewrapCandidate) => Promise<Envelope>): Promise<RewrapResult | undefined> {
    if (this.rewrapLocked) return undefined;
    const result: RewrapResult = { rewrapped: 0, skipped: 0, failed: [] };
    const candidates = this.rows
      .map(row => ({ id: row.id, version: row.version, kid: (row.secret as Partial<Envelope>).kid ?? null, secret: row.secret }))
      .filter(candidate => candidate.kid !== activeKeyId);
    for (const candidate of candidates) {
      const secret = await rewrap(candidate).catch(() => undefined);
      if (!secret || candidate.kid === null) {
        result.failed.push(candidate.id);
        continue;
      }
      this.beforeRewrapWrite?.(candidate);
      const row = this.rows.find(current => current.id === candidate.id && current.version === candidate.version && (current.secret as Envelope).kid === candidate.kid);
      if (!row) {
        result.skipped++;
        continue;
      }
      row.secret = secret;
      result.rewrapped++;
    }
    return result;
  }

  private insert(values: NewCredential, actor: string): Credential.Row {
    const row: Credential.Row = { ...values, version: 1, createdBy: actor, createdAt: new Date(), rotatedAt: null, revokedAt: null };
    this.rows.push(row);
    this.events.push({ credentialId: row.id, action: 'create', actor });
    return { ...row };
  }
}
