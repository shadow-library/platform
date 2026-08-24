/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Config, Logger, LRUCache } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { AccountRepository, type ProfileSnapshot } from './account.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const ACCOUNT_ID_CACHE_CAPACITY = 4096;
const ACCOUNT_CONTEXT: unique symbol = Symbol('shadow-memoir:account-context');

/**
 * Resolves the authenticated caller's `sub` into an account id, once per request, memoized in the
 * ambient request context (`ContextService`'s per-request store) so `OwnerScopedRepository.scoped()`
 * can read it back synchronously later in the same request. The `sub -> account_id` mapping — which
 * never changes for the row's lifetime — is additionally LRU-cached across requests (à la
 * `web-novel-server`'s `NovelAccessService` membership cache) so a hot account skips the upsert-lookup
 * round trip; `deletion_state` deliberately is NOT part of that cache and is re-read on every request
 * (a cheap primary-key lookup), because a deletion refusal has to be immediate — T-30's deletion state
 * machine relies on this taking effect on the very next request, not after a cache TTL.
 */
@Injectable()
export class AccountContext {
  private readonly logger = Logger.getLogger(APP_NAME, AccountContext.name);
  private readonly accountIdCache = new LRUCache(ACCOUNT_ID_CACHE_CAPACITY, { ttl: Config.get('account.context-ttl') * 1000 });

  constructor(
    private readonly context: ContextService,
    private readonly accountRepository: AccountRepository,
    private readonly authClient: AuthClient,
  ) {}

  /** Resolves (creating the account on first contact) and memoizes it for the remainder of the request. Throws `ACC_002` if the account is mid-deletion, unless the route opted out via `@AllowDuringDeletion()`. */
  async resolve(identitySub: string, allowDuringDeletion = false): Promise<void> {
    let accountId = this.accountIdCache.get<bigint>(identitySub);
    if (accountId === null || accountId === undefined) {
      const existing = await this.accountRepository.findByIdentitySub(identitySub);
      const account = existing ?? (await this.accountRepository.create(identitySub, await this.captureProfile()));
      accountId = account.id;
      this.accountIdCache.set(identitySub, accountId);
    }

    const deletionState = await this.accountRepository.findDeletionState(accountId);
    if (deletionState !== 'none' && !allowDuringDeletion) throw AppErrorCode.ACC_002.create();
    this.context.set(ACCOUNT_CONTEXT, accountId);
  }

  /** The resolved account id for the current request, or `null` if {@link resolve} has not run in it. */
  getAccountId(): bigint | null {
    return this.context.get<bigint>(ACCOUNT_CONTEXT);
  }

  /**
   * Best-effort: the caller's own bearer token, when the request presented one, carries `getUserInfo`'s
   * own claim — a session established before `profile`/`email` were consented returns `sub` alone, and
   * a cookie-session caller has no bearer to read here at all, in which case the account is created with
   * placeholder profile fields, same as before T-17. Never blocks account creation on identity being
   * reachable.
   */
  private async captureProfile(): Promise<ProfileSnapshot> {
    const header = this.context.getRequest(false)?.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) return {};

    return this.authClient
      .getUserInfo(token)
      .then(info => ({ email: info.email ?? null, displayName: info.name ?? null, photoUrl: info.picture ?? null }))
      .catch((error: Error) => {
        this.logger.warn('profile capture failed on first contact; account created with placeholder profile', { reason: error.message });
        return {};
      });
  }
}
