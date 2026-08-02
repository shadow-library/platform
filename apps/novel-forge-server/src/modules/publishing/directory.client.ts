/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

export interface ResolvedUser {
  email: string;
  userId: string;
}

interface ResolveResponse {
  users: ResolvedUser[];
}

/**
 * Declaring the constants
 */

/** Identity service name; resolves via `SERVICE_URL_IDENTITY_SERVER` or in-cluster svc DNS. */
export const IDENTITY_SERVICE = 'identity-server';

/** Identity's own platform API keeps its bare identifier rather than an `api://<app>` resource. */
export const IDENTITY_RESOURCE = 'shadow-identity';

export const DIRECTORY_SCOPE = 'users:resolve';

/** Identity caps a single lookup; batching above this would be silently truncated on the other side. */
const RESOLVE_BATCH_SIZE = 50;

/**
 * Turns the addresses an author typed into identity subjects. This is the only place in the
 * publishing pipeline that speaks to identity, and it is deliberately the *forge's* job rather than
 * the reader's: resolving at share time means the reader database only ever holds subject ids, and
 * the reader never needs an identity round trip to answer whether someone may read a novel.
 *
 * An address that resolves to nothing is simply absent from the answer, which the caller records as
 * a pending grant rather than an error — see `publication_grant_state`.
 */
@Injectable()
export class DirectoryClient {
  private readonly logger = Logger.getLogger(APP_NAME, DirectoryClient.name);

  constructor(private readonly authClient: AuthClient) {}

  /** Returns the resolved subset, keyed by the caller's own spelling of each address. */
  async resolveEmails(emails: string[]): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    if (emails.length === 0) return resolved;

    for (let index = 0; index < emails.length; index += RESOLVE_BATCH_SIZE) {
      const batch = emails.slice(index, index + RESOLVE_BATCH_SIZE);
      const response = await this.authClient.fetchService<ResolveResponse>(
        IDENTITY_SERVICE,
        '/api/v1/internal/users/resolve',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emails: batch }) },
        { resource: IDENTITY_RESOURCE, scopes: [DIRECTORY_SCOPE] },
      );
      if (response.statusCode >= 400) throw AppErrorCode.PUB_005.create({ reason: `identity answered http ${response.statusCode}` });
      for (const user of response.data?.users ?? []) resolved.set(user.email.toLowerCase(), user.userId);
    }

    this.logger.debug('directory resolve completed', { requested: emails.length, resolved: resolved.size });
    return resolved;
  }
}
