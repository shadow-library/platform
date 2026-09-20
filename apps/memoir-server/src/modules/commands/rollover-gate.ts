/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type EnsureRolloverCurrent = (accountId: bigint) => Promise<void>;

/**
 * Declaring the constants
 */

/**
 * The lazy-invocation seam of ARCHITECTURE §13.1: every account-scoped command and every delta pull
 * closes elapsed days before it acts. The walk itself lives in `@modules/rollover`, which depends on
 * this module for `HeroLedger` — so the dependency is inverted here the same way `DeltaSourceRegistry`
 * inverts delta assembly, and a module graph booted without the rollover module (T-18's own suite) sees
 * an unregistered gate rather than a missing provider.
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
