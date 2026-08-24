/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DeltaRepository, DeltaSourceRegistry, type KeysetDeltaSource } from '@modules/sync';
import { schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Registers the four AI delta domains (ARCHITECTURE §10.3): `applied_suggestions` and `ai_task_audit` are not synced — the client never needs its own copy of either (§28.6 covers auditability server-side). */
@Injectable()
export class AiDeltaSources implements OnModuleInit {
  constructor(
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.keysetSource('ai_tasks', schema.aiTasks));
    this.registry.register(this.keysetSource('ai_results', schema.aiResults));
    this.registry.register(this.keysetSource('ai_scheduled_queries', schema.aiScheduledQueries));
    this.registry.register(this.keysetSource('ai_consents', schema.aiConsents));
  }

  private keysetSource(domain: string, table: Parameters<DeltaRepository['fetchSince']>[0]): KeysetDeltaSource {
    return { domain, kind: 'keyset', fetch: ({ since, limit }) => this.deltaRepository.fetchSince(table, since, limit) };
  }
}
