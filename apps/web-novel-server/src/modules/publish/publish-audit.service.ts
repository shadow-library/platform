import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/modules/datastore';

import { type PublishAuditEntry } from './publish.types';

@Injectable()
export class PublishAuditService {
  private readonly logger = Logger.getLogger(APP_NAME, PublishAuditService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly context: ContextService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Records an audit row; pass `tx` to make the row atomic with the mutation it describes. The
   * caller marks the request recorded only after its transaction commits, so a rollback never
   * leaves the call flagged without a row.
   */
  async record(entry: PublishAuditEntry, tx?: Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0]): Promise<void> {
    const executor = tx ?? this.db;
    await executor.insert(schema.publishAuditLog).values({
      callerSub: entry.callerSub,
      callerClientId: entry.callerClientId,
      action: entry.action,
      novelSlug: entry.novelSlug,
      ordinal: entry.ordinal,
      contentHash: entry.contentHash,
      incomingRevision: entry.incomingRevision,
      storedRevision: entry.storedRevision,
      outcome: entry.outcome,
      error: entry.error,
    });
    this.logger.debug('publish audit row recorded', { action: entry.action, novelSlug: entry.novelSlug, ordinal: entry.ordinal, outcome: entry.outcome });
  }

  markRecorded(): void {
    if (!this.context.isInitialized()) return;
    const request = this.context.getRequest(false);
    if (request) request.publishAuditRecorded = true;
  }
}
