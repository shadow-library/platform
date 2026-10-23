import { Injectable } from '@shadow-library/app';

export type EnsureRolloverCurrent = (accountId: bigint) => Promise<void>;

/**
 * The lazy-invocation seam: every account-scoped command and delta pull closes elapsed days before acting. The walk lives in
 * `@modules/rollover`, which depends on this module for `HeroLedger`,
 * so the dependency is inverted here (like `DeltaSourceRegistry` for delta assembly) and a graph without the rollover module sees an unregistered gate.
 */
@Injectable()
export class RolloverGate {
  private ensure: EnsureRolloverCurrent | null = null;

  register(ensure: EnsureRolloverCurrent): void {
    this.ensure = ensure;
  }

  async ensureCurrent(accountId: bigint): Promise<void> {
    await this.ensure?.(accountId);
  }
}
