import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Config, Logger, LRUCache } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { AccountRepository, type ProfileSnapshot } from './account.repository';

const ACCOUNT_ID_CACHE_CAPACITY = 4096;
const ACCOUNT_CONTEXT: unique symbol = Symbol('memoir:account-context');

/**
 * Resolves the caller's `sub` into an account id once per request, memoized in the request context so `OwnerScopedRepository.scoped()` can
 * read it synchronously. The `sub -> account_id` mapping is additionally LRU-cached across requests;
 * `deletion_state` is deliberately not cached and is re-read on every request, so a deletion refusal takes effect on the very next request.
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

  getAccountId(): bigint | null {
    return this.context.get<bigint>(ACCOUNT_CONTEXT);
  }

  /**
   * Best-effort: a bearer token carries `getUserInfo`'s claims (a session from before `profile`/`email` consent returns `sub` alone); a cookie-session caller has no bearer,
   * so the account gets placeholder profile fields. Never blocks account creation on identity being reachable.
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
