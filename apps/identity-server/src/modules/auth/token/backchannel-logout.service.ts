/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { and, asc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { KeyService } from '@server/modules/auth/keys';
import { DatabaseService, OidcLogoutDelivery, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * OIDC Back-Channel Logout 1.0: when a session terminates, every client that obtained tokens in
 * that session and registered a `backchannel_logout_uri` receives a signed logout token. Delivery
 * rides a transactional outbox (mirroring the notification pipeline) so it survives crashes and
 * retries with backoff; the worker process is the only sender.
 */
const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const LOGOUT_TOKEN_TTL_SECONDS = 120;
const MAX_ATTEMPTS = 5;
const CLAIMABLE_STATUSES: OidcLogoutDelivery.Status[] = ['PENDING', 'FAILED'];

@Injectable()
export class BackChannelLogoutService {
  private readonly logger = Logger.getLogger(APP_NAME, BackChannelLogoutService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly keyService: KeyService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Queues logout notifications for every registered client that holds a refresh-token family
   * bound to the session. Family status is deliberately ignored: revocation usually precedes the
   * enqueue in the same request.
   */
  async enqueueForSession(sessionId: bigint, userId: bigint): Promise<number> {
    const targets = await this.db
      .selectDistinct({ clientId: schema.oauthClients.id, uri: schema.oauthClients.backchannelLogoutUri })
      .from(schema.refreshTokenFamilies)
      .innerJoin(schema.oauthClients, eq(schema.refreshTokenFamilies.clientId, schema.oauthClients.id))
      .where(and(eq(schema.refreshTokenFamilies.sessionId, sessionId), isNotNull(schema.oauthClients.backchannelLogoutUri), eq(schema.oauthClients.isActive, true)));

    for (const target of targets) {
      if (!target.uri) continue;
      await this.db.insert(schema.oidcLogoutDeliveries).values({ clientId: target.clientId, logoutUri: target.uri, subject: userId.toString(), sid: sessionId.toString() });
    }
    if (targets.length > 0) this.logger.debug('Queued back-channel logout deliveries', { sessionId, count: targets.length });
    return targets.length;
  }

  /**
   * The logout token is minted at send time: it expires in minutes while delivery retries may
   * span hours. Per spec it carries the `events` claim and `sid`, and never a `nonce`.
   */
  private mintLogoutToken(delivery: OidcLogoutDelivery): string {
    const iat = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.issuer,
      sub: delivery.subject,
      aud: delivery.clientId,
      iat,
      exp: iat + LOGOUT_TOKEN_TTL_SECONDS,
      jti: randomUUID(),
      events: { [LOGOUT_EVENT]: {} },
      sid: delivery.sid,
    };
    return this.keyService.sign(claims).token;
  }

  /** Requeues deliveries stranded in SENDING by a worker crash; runs once at worker boot. */
  async recoverStuckDeliveries(): Promise<number> {
    const recovered = await this.db
      .update(schema.oidcLogoutDeliveries)
      .set({ status: 'FAILED', lastError: 'recovered after interrupted delivery' })
      .where(eq(schema.oidcLogoutDeliveries.status, 'SENDING'))
      .returning({ id: schema.oidcLogoutDeliveries.id });
    if (recovered.length > 0) this.logger.warn('Recovered interrupted logout deliveries', { count: recovered.length });
    return recovered.length;
  }

  /** Claims a batch of due deliveries and posts the logout tokens. Worker-driven. */
  async dispatchPending(limit = 20): Promise<number> {
    const claimed = await this.db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(schema.oidcLogoutDeliveries)
        .where(and(inArray(schema.oidcLogoutDeliveries.status, CLAIMABLE_STATUSES), lte(schema.oidcLogoutDeliveries.nextAttemptAt, sql`now()`)))
        .orderBy(asc(schema.oidcLogoutDeliveries.nextAttemptAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];
      await tx
        .update(schema.oidcLogoutDeliveries)
        .set({ status: 'SENDING' })
        .where(
          inArray(
            schema.oidcLogoutDeliveries.id,
            rows.map(row => row.id),
          ),
        );
      return rows;
    });

    let sent = 0;
    for (const delivery of claimed) {
      try {
        await this.send(delivery);
        await this.db.update(schema.oidcLogoutDeliveries).set({ status: 'SENT', sentAt: new Date() }).where(eq(schema.oidcLogoutDeliveries.id, delivery.id));
        sent += 1;
      } catch (error) {
        await this.markFailed(delivery, error);
      }
    }
    return sent;
  }

  private async send(delivery: OidcLogoutDelivery): Promise<void> {
    const token = this.mintLogoutToken(delivery);
    const response = await fetch(delivery.logoutUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `logout_token=${encodeURIComponent(token)}`,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`logout endpoint answered ${response.status}`);
  }

  private async markFailed(delivery: OidcLogoutDelivery, error: unknown): Promise<void> {
    const attemptCount = delivery.attemptCount + 1;
    const dead = attemptCount >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(2 ** attemptCount, 60);
    const message = error instanceof Error ? error.message : String(error);
    await this.db
      .update(schema.oidcLogoutDeliveries)
      .set({ status: dead ? 'DEAD' : 'FAILED', attemptCount, lastError: message, nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000) })
      .where(eq(schema.oidcLogoutDeliveries.id, delivery.id));
    this.logger[dead ? 'error' : 'warn'](`Back-channel logout ${dead ? 'dead-lettered' : 'delivery failed'}`, { id: delivery.id, attemptCount, message });
  }
}
