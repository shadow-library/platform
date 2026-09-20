/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
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

  /** A domain this server does not know is left out rather than refused, so a web release that names a newer domain keeps syncing against an older server. */
  resolve(domains?: string[]): DeltaSource[] {
    if (!domains?.length) return [...this.sources.values()];
    return domains.flatMap(domain => this.sources.get(domain) ?? []);
  }
}
