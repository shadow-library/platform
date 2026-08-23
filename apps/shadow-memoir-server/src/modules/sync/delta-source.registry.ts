/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { type DeltaSource } from './sync.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The extension seam for `GET /sync/delta`: a module owning a syncable table registers its own
 * `DeltaSource` at init, and the assembler never learns the domain's name or row shape. That is the
 * whole point — the delta payload grows with T-17, T-18, T-23…T-25 without any of them editing
 * `SyncService`, and a domain's projection stays with the module that understands what may be exposed.
 */
@Injectable()
export class DeltaSourceRegistry {
  private readonly sources = new Map<string, DeltaSource>();

  register(source: DeltaSource): void {
    if (this.sources.has(source.domain)) throw AppError.internal(`a delta source for domain '${source.domain}' is already registered`);
    this.sources.set(source.domain, source);
  }

  domains(): string[] {
    return [...this.sources.keys()];
  }

  resolve(domains?: string[]): DeltaSource[] {
    if (!domains?.length) return [...this.sources.values()];
    return domains.map(domain => {
      const source = this.sources.get(domain);
      if (!source) throw AppErrorCode.SYN_001.create({ domain });
      return source;
    });
  }
}
