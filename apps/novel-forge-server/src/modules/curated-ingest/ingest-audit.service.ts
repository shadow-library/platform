import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

export type IngestAction = 'novel.upsert' | 'chapter.push' | 'cover.set';

export type IngestOutcome = 'created' | 'exists' | 'landed' | 'noop' | 'applied' | 'not_found' | 'out_of_order' | 'conflict' | 'error';

export interface IngestAuditEntry {
  apiKeyId: bigint | null;
  action: IngestAction;
  sourceRef: string;
  projectId?: bigint | null;
  outcome: IngestOutcome;
}

@Injectable()
export class IngestAuditService {
  private readonly logger = Logger.getLogger(APP_NAME, IngestAuditService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Records the attempt after the mutation it describes has settled, so the trail can never claim a write
   * that a rolled-back transaction discarded. A rejection is recorded exactly like a success — the point of
   * the trail is to explain what a scraper did, and most of what it does is get refused.
   */
  async record(entry: IngestAuditEntry): Promise<void> {
    await this.db.insert(schema.ingestAuditLog).values({
      apiKeyId: entry.apiKeyId,
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
      apiKeyId: entry.apiKeyId?.toString() ?? null,
    });
  }
}
