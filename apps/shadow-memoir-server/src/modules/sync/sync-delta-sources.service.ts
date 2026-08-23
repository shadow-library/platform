/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { schema } from '@server/database';

import { DeltaRepository, type SyncableTable } from './delta.repository';
import { DeltaSourceRegistry } from './delta-source.registry';
import { type KeysetDeltaSource } from './sync.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The domains backed by tables the sync spine itself owns. Anything a later module adds — quest
 * occurrences it reshapes, expenses, quick logs, metrics — is registered by that module instead, which
 * is why `DeltaSourceRegistry` exists at all. `quests`, `quest_logs` and `quest_streaks` moved to
 * `modules/quests` (T-18); `account` moved to `@modules/account`'s `AccountService` (T-17), mirroring
 * `DeviceService`'s self-registration. `daily_states` sits here for now because its owning module (T-19)
 * does not exist yet, and should move the same way once it does.
 */
const KEYSET_TABLES: [string, SyncableTable][] = [['daily_states', schema.dailyStates]];

@Injectable()
export class SyncDeltaSources implements OnModuleInit {
  constructor(
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
  ) {}

  onModuleInit(): void {
    for (const [domain, table] of KEYSET_TABLES) this.registry.register(this.keysetSource(domain, table));
  }

  private keysetSource(domain: string, table: SyncableTable): KeysetDeltaSource {
    return { domain, kind: 'keyset', fetch: ({ since, limit }) => this.deltaRepository.fetchSince(table, since, limit) };
  }
}
