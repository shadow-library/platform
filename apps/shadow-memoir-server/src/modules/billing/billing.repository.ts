/**
 * Importing npm packages
 */
import { and, eq, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type Entitlement, RolePoolService, schema } from '@server/database';

import { type NormalizedBillingEvent } from './billing.types';
import { applyBillingEvent, type EntitlementProjection, FREE_PROJECTION } from './entitlement-lifecycle';

/**
 * Defining types
 */

export interface WebhookApplyResult {
  duplicate: boolean;
  quarantined: boolean;
  applied: boolean;
}

/**
 * Declaring the constants
 */

function toProjection(row: Entitlement.Row | undefined): EntitlementProjection {
  if (!row) return FREE_PROJECTION;
  const { tier, state, expiresAt, graceEndsAt, provider, providerRef, trialUsed, appliedEventAt } = row;
  return { tier, state, expiresAt, graceEndsAt, provider, providerRef, trialUsed, appliedEventAt };
}

/**
 * The only writer of `entitlements`, and it runs on the dedicated `memoir_billing` pool (ARCHITECTURE
 * §5.4, §16.2) — the API pool holds SELECT alone, so even a mistaken write from the command path is
 * refused by Postgres rather than by convention. Deliberately not an `OwnerScopedRepository`: a webhook
 * has no request account to scope to, it discovers one from the purchase token the provider echoes.
 */
@Injectable()
export class BillingRepository {
  constructor(private readonly rolePools: RolePoolService) {}

  /** A method rather than a getter: DI walks an instance's properties during init, and a getter would open the billing pool at boot on every replica, including ones that never serve a webhook. */
  private db(): ReturnType<RolePoolService['getPool']> {
    return this.rolePools.getPool('memoir_billing');
  }

  async findAccountIdByPurchaseToken(purchaseToken: string): Promise<bigint | null> {
    const [account] = await this.db().select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.purchaseToken, purchaseToken));
    return account?.id ?? null;
  }

  async findAccountIdByProviderRef(provider: string, providerRef: string): Promise<bigint | null> {
    const [row] = await this.db()
      .select({ accountId: schema.entitlements.accountId })
      .from(schema.entitlements)
      .where(and(eq(schema.entitlements.provider, provider), eq(schema.entitlements.providerRef, providerRef)));
    return row?.accountId ?? null;
  }

  /**
   * One transaction covering the whole webhook (ARCHITECTURE §16.2). The event row is inserted first
   * and `ON CONFLICT DO NOTHING` on `provider_event_id` — a duplicate or replayed delivery lands zero
   * rows and returns before any projection work, which is what makes replay a no-op rather than a
   * converging re-application. An unmatched purchase token still persists its event, flagged for the
   * reconciliation runbook, and the delivery is acknowledged rather than failed.
   */
  async recordAndApply(event: NormalizedBillingEvent, provider: string, accountId: bigint | null, graceDays: number): Promise<WebhookApplyResult> {
    return this.db().transaction(async tx => {
      const [inserted] = await tx
        .insert(schema.billingEvents)
        .values({
          provider,
          providerEventId: event.providerEventId,
          accountId,
          type: event.type,
          payload: event.payload,
          processed: accountId !== null,
          quarantined: accountId === null,
          occurredAt: event.occurredAt,
        })
        .onConflictDoNothing({ target: schema.billingEvents.providerEventId })
        .returning({ id: schema.billingEvents.id });

      if (!inserted) return { duplicate: true, quarantined: false, applied: false };
      if (accountId === null) return { duplicate: false, quarantined: true, applied: false };

      await tx.insert(schema.entitlements).values({ accountId }).onConflictDoNothing({ target: schema.entitlements.accountId });
      const [current] = await tx.select().from(schema.entitlements).where(eq(schema.entitlements.accountId, accountId)).for('update');

      const next = applyBillingEvent(toProjection(current), event, provider, graceDays);
      if (!next) return { duplicate: false, quarantined: false, applied: false };

      await tx
        .update(schema.entitlements)
        .set({ ...next, syncSeq: sql`nextval('sync_seq')`, updatedAt: new Date() })
        .where(eq(schema.entitlements.accountId, accountId));

      return { duplicate: false, quarantined: false, applied: true };
    });
  }

  /**
   * Materializes the server-time lapse the read path already derives (see `resolveEffectiveState`), so
   * a client's entitlement delta reflects the transition without waiting for a webhook that may never
   * come. Purely a projection catch-up: it can only move a row to the state a read of it already
   * reports, never past it.
   */
  async lapseExpired(now: Date): Promise<number> {
    const expiredPeriod = and(
      or(eq(schema.entitlements.state, 'trial'), eq(schema.entitlements.state, 'active')),
      isNotNull(schema.entitlements.expiresAt),
      lt(schema.entitlements.expiresAt, now),
    );
    const expiredGrace = and(eq(schema.entitlements.state, 'grace'), isNotNull(schema.entitlements.graceEndsAt), lt(schema.entitlements.graceEndsAt, now));

    const lapsed = await this.db()
      .update(schema.entitlements)
      .set({ tier: 'free', state: 'lapsed', graceEndsAt: null, syncSeq: sql`nextval('sync_seq')`, updatedAt: now })
      .where(and(ne(schema.entitlements.state, 'lapsed'), or(expiredPeriod, expiredGrace)))
      .returning({ accountId: schema.entitlements.accountId });

    return lapsed.length;
  }
}
