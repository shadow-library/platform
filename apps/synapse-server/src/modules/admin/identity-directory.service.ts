import { AuthClient, type DirectoryUser } from '@shadow-library/auth';
import { Inject, Injectable, InjectionToken } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type CatalogTimers } from '@modules/catalog';

const NAME_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const LOOKUP_DEADLINE_MS = 1500;
const MAX_CACHED_SUBJECTS = 1000;
const USER_ID = /^\d{1,19}$/;
const TIMED_OUT = Symbol('timed out');

export const DIRECTORY_TIMERS = new InjectionToken<CatalogTimers>('DIRECTORY_TIMERS');

interface CachedName {
  name: string | null;
  expiresAt: number;
}

interface Edited {
  createdBy?: string;
}

export type EditorNamed<T> = T & { createdByName: string | null };

function displayNameOf(user: DirectoryUser): string | null {
  const chosen = user.displayName?.trim();
  if (chosen) return chosen;
  const full = [user.firstName, user.lastName]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
  return full || null;
}

function named<T extends Edited>(item: T, names: ReadonlyMap<string, string | null>): EditorNamed<T> {
  return { ...item, createdByName: item.createdBy === undefined ? null : (names.get(item.createdBy) ?? null) };
}

/** Identity names only users holding a consent with the `synapse` client, which signing in to the console grants; `seed`, `import` and anyone else stay unnamed. */
@Injectable()
export class IdentityDirectoryService {
  private readonly logger = Logger.getLogger(APP_NAME, IdentityDirectoryService.name);
  private readonly cache = new Map<string, CachedName>();
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly auth: AuthClient,
    @Inject(DIRECTORY_TIMERS) private readonly timers: CatalogTimers,
  ) {}

  async withEditorName<T extends Edited>(item: T): Promise<EditorNamed<T>> {
    return named(item, await this.displayNames([item.createdBy]));
  }

  async withEditorNames<T extends Edited>(items: T[]): Promise<EditorNamed<T>[]> {
    const names = await this.displayNames(items.map(item => item.createdBy));
    return items.map(item => named(item, names));
  }

  async displayNames(subjects: readonly (string | undefined)[]): Promise<ReadonlyMap<string, string | null>> {
    const now = Date.now();
    const names = new Map<string, string | null>();
    const pending = new Map<string, Promise<string | null>>();
    const unseen: string[] = [];
    for (const subject of new Set(subjects)) {
      if (subject === undefined) continue;
      const cached = this.cache.get(subject);
      const inFlight = this.inFlight.get(subject);
      if (!USER_ID.test(subject)) names.set(subject, null);
      else if (cached && cached.expiresAt > now) names.set(subject, cached.name);
      else if (inFlight) pending.set(subject, inFlight);
      else unseen.push(subject);
    }
    if (unseen.length > 0) for (const [subject, answer] of this.lookup(unseen)) pending.set(subject, answer);
    if (pending.size === 0) return names;
    for (const [subject, name] of await this.withinDeadline(pending)) names.set(subject, name);
    return names;
  }

  /** The answer is cached whenever it lands, even after the deadline gave up on it, so a slow Identity still fills the cache for the next request. */
  private lookup(subjects: string[]): Map<string, Promise<string | null>> {
    const settled = this.auth.lookupUsers(subjects).then(
      users => new Map(users.map(user => [user.userId, displayNameOf(user)])),
      (error: unknown) => {
        this.logger.warn('Could not resolve editor names from Identity', { subjects, code: AppError.is(error) ? error.code : undefined });
        return null;
      },
    );
    const answers = new Map<string, Promise<string | null>>();
    for (const subject of subjects) {
      const answer: Promise<string | null> = settled.then(resolved => {
        const name = resolved ? (resolved.get(subject) ?? null) : this.lastKnown(subject);
        this.remember(subject, name, resolved ? NAME_TTL_MS : FAILURE_TTL_MS);
        if (this.inFlight.get(subject) === answer) this.inFlight.delete(subject);
        return name;
      });
      this.inFlight.set(subject, answer);
      answers.set(subject, answer);
    }
    return answers;
  }

  private async withinDeadline(pending: Map<string, Promise<string | null>>): Promise<Map<string, string | null>> {
    const deadline = this.timers.after(LOOKUP_DEADLINE_MS);
    const elapsed = deadline.elapsed.then((): typeof TIMED_OUT => TIMED_OUT);
    const answers = await Promise.all([...pending].map(async ([subject, answer]) => [subject, await Promise.race([answer, elapsed])] as const));
    deadline.cancel();

    const names = new Map<string, string | null>();
    const late: string[] = [];
    for (const [subject, answer] of answers) {
      if (answer !== TIMED_OUT) {
        names.set(subject, answer);
        continue;
      }
      late.push(subject);
      names.set(subject, this.lastKnown(subject));
      this.remember(subject, this.lastKnown(subject), FAILURE_TTL_MS);
      if (this.inFlight.get(subject) === pending.get(subject)) this.inFlight.delete(subject);
    }
    if (late.length > 0) this.logger.warn('Identity did not name editors in time', { subjects: late });
    return names;
  }

  private lastKnown(subject: string): string | null {
    return this.cache.get(subject)?.name ?? null;
  }

  private remember(subject: string, name: string | null, ttlMs: number): void {
    this.cache.delete(subject);
    this.cache.set(subject, { name, expiresAt: Date.now() + ttlMs });
    const oldest = this.cache.keys().next();
    if (this.cache.size > MAX_CACHED_SUBJECTS && !oldest.done) this.cache.delete(oldest.value);
  }
}
