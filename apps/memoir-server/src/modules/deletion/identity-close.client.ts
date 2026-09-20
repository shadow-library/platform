/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

export type IdentityCloseOutcome = 'closed' | 'unconfigured' | 'unavailable';

/**
 * Declaring the constants
 */

/**
 * Step 5's seam (ARCHITECTURE §21.3). A class token rather than a TS interface so DI has something to
 * bind against, mirroring `OcrStructuringClient`. Identity has no hard delete anywhere; `closed` means
 * the identity record reached the soft-close (`anonymize` + `CLOSED` + `revokeAllAccess`) that is the
 * platform's deletion semantic.
 */
export abstract class IdentityCloseClient {
  abstract close(identitySub: string): Promise<IdentityCloseOutcome>;
}

/**
 * Config-gated M2M close. `identity.close-path` is empty until identity grants this client a
 * machine-side close scope — T-03 shipped `DELETE /api/v1/me`, which is self-service and needs the
 * user's own session, so it is unreachable from here (§21.3 option 1's `users:close` variant is the
 * one that fits). Until then every call reports `unconfigured` and the state machine rests at
 * `data_deleted`, which §21.3 names a legitimate resting state — it never reports a close that did not
 * happen.
 */
@Injectable()
export class HttpIdentityCloseClient extends IdentityCloseClient {
  private readonly logger = Logger.getLogger(APP_NAME, HttpIdentityCloseClient.name);

  constructor(private readonly authClient: AuthClient) {
    super();
  }

  async close(identitySub: string): Promise<IdentityCloseOutcome> {
    const path = Config.get('identity.close-path');
    if (!path) return 'unconfigured';

    const service = Config.get('identity.close-service');
    const scope = Config.get('identity.close-scope');
    const target = path.replace('{sub}', encodeURIComponent(identitySub));

    const response = await this.authClient
      .fetchService(service, target, { method: 'DELETE' }, { scopes: [scope] })
      .catch((error: Error) => (this.logger.error('identity close call failed', { service, error: error.message }), null));
    if (!response) return 'unavailable';

    /** An already-closed record answers 404; treating it as success is what makes the step re-entrant. */
    if (response.statusCode < 300 || response.statusCode === 404) return 'closed';
    this.logger.error('identity refused the account close', { service, statusCode: response.statusCode });
    return 'unavailable';
  }
}
