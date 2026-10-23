import { Injectable, type OnModuleInit } from '@shadow-library/app';

import { DeltaRepository, DeltaSourceRegistry, type KeysetDeltaSource } from '@modules/sync';
import { schema } from '@server/database';

/** Registers the four AI delta domains; `applied_suggestions` and `ai_task_audit` are not synced, since the client never needs its own copy. */
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
