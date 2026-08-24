/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountContext, AccountRepository } from '@modules/auth';
import { type DeltaRow, DeltaSourceRegistry, type SnapshotDeltaSource } from '@modules/sync';
import { type Entitlement } from '@server/database';

import { BillingProviderAdapter, type CheckoutPlan } from './billing.types';
import { resolveEffectiveState, tierFor } from './entitlement-lifecycle';
import { EntitlementRepository } from './entitlement.repository';

/**
 * Defining types
 */

export interface EntitlementView {
  tier: Entitlement.Tier;
  state: Entitlement.State;
  expiresAt: Date | null;
  trialUsed: boolean;
}

export interface CheckoutResult {
  url: string;
  expiresAt: Date;
}

/**
 * Declaring the constants
 */

const FREE_VIEW: EntitlementView = { tier: 'free', state: 'free', expiresAt: null, trialUsed: false };

/**
 * The entitlement **read** surface every gate consumes — `getTier` is what T-32/T-33 call before
 * admitting an AI task, and it resolves against server time on every call, so a lapse re-applies those
 * gates the instant the period ends without anything having to be swept first. Nothing here writes:
 * the billing webhook is the sole writer (ARCHITECTURE §16.2), enforced at the grant layer.
 *
 * `rules` never sees any of this. Paid state is not an input to a single progression computation
 * (Invariant 2), and the absence of an import path from `rules` into this module is what makes that
 * structural rather than a habit.
 */
@Injectable()
export class EntitlementService implements OnModuleInit {
  constructor(
    private readonly accountContext: AccountContext,
    private readonly accountRepository: AccountRepository,
    private readonly entitlementRepository: EntitlementRepository,
    private readonly adapter: BillingProviderAdapter,
    private readonly registry: DeltaSourceRegistry,
  ) {}

  onModuleInit(): void {
    const source: SnapshotDeltaSource = { domain: 'entitlement', kind: 'snapshot', fetch: () => this.fetchSnapshot() };
    this.registry.register(source);
  }

  async getTier(accountId: bigint): Promise<Entitlement.Tier> {
    return (await this.get(accountId)).tier;
  }

  async get(accountId: bigint, now = new Date()): Promise<EntitlementView> {
    const row = await this.entitlementRepository.findByAccountId(accountId);
    if (!row) return FREE_VIEW;

    const state = resolveEffectiveState(row, now);
    return { tier: tierFor(state), state, expiresAt: row.expiresAt, trialUsed: row.trialUsed };
  }

  /**
   * The hosted session is minted server-side with the account's own purchase token as client reference
   * (ARCHITECTURE §16.2) — the client never names an account, never talks to the provider's API, and
   * never handles card data. `trial` is offered only while the account still has its one trial.
   */
  async createCheckout(plan: CheckoutPlan): Promise<CheckoutResult> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('EntitlementService used without a resolved account context');

    const account = await this.accountRepository.findById(accountId);
    if (!account) throw AppError.internal(`resolved account id '${accountId}' has no accounts row`);

    const entitlement = await this.get(accountId);
    const trialDays = Config.get('billing.trial-days');
    const session = await this.adapter.createCheckoutSession({ purchaseToken: account.purchaseToken, plan, trial: !entitlement.trialUsed && trialDays > 0 });
    return { url: session.url, expiresAt: session.expiresAt };
  }

  private async fetchSnapshot(): Promise<DeltaRow[]> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) return [];

    const view = await this.get(accountId);
    return [{ tier: view.tier, state: view.state, expiresAt: view.expiresAt?.toISOString() ?? null, trialUsed: view.trialUsed }];
  }
}
