import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { ActorService } from '@modules/actor';

export type IngestAction = 'novel.upsert' | 'chapter.push' | 'cover.set' | 'original.push' | 'originals.manifest';

export type IngestOutcome = 'created' | 'exists' | 'landed' | 'noop' | 'applied' | 'not_found' | 'out_of_order' | 'conflict' | 'error';

export interface IngestAuditEntry {
  action: IngestAction;
  sourceRef: string;
  projectId?: bigint | null;
  outcome: IngestOutcome;
}

@Injectable()
export class IngestAuditService {
  private readonly logger = Logger.getLogger(APP_NAME, IngestAuditService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly actorService: ActorService,
    private readonly context: ContextService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Records the attempt after the mutation it describes has settled, so the trail can never claim a write
   * that a rolled-back transaction discarded. A rejection is recorded exactly like a success — the point of
   * the trail is to explain what a caller did, and most of what it does is get refused.
   *
   * The caller is resolved here rather than passed in, so every ingest route names its actor the same way.
   */
  async record(entry: IngestAuditEntry): Promise<void> {
    const actor = this.actorService.current();
    const principal = this.context.getAuthPrincipal();
    const botKeyId = principal.kind === 'bot' ? principal.keyId : null;

    await this.db.insert(schema.ingestAuditLog).values({
      actorKind: actor.kind,
      actorId: actor.id,
      botKeyId,
      action: entry.action,
      sourceRef: entry.sourceRef,
      projectId: entry.projectId ?? null,
      outcome: entry.outcome,
    });
    this.logger.info('curated ingest', {
      action: entry.action,
      sourceRef: entry.sourceRef,
      outcome: entry.outcome,
      projectId: entry.projectId?.toString() ?? null,
      actorKind: actor.kind,
      actorId: actor.id.toString(),
      botKeyId,
    });
  }
}
