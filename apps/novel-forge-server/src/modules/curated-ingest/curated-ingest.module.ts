import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ApiKeyModule } from '../api-key';
import { ProjectModule } from '../project';
import { CuratedIngestController } from './curated-ingest.controller';
import { CuratedIngestService } from './curated-ingest.service';
import { IngestAuditService } from './ingest-audit.service';

// ApiKeyModule is imported for its ApiKeyGuard, never re-listed in `controllers`: middlewares are
// app-global once registered, so a second listing would run the authentication hook twice per request.
// ProjectModule supplies ProjectService, whose `setCover` already owns the storage write and the
// content-addressed ref semantics the ingest cover push needs.
@Module({
  imports: [DatabaseModule, StorageModule, FastifyModule, ApiKeyModule, ProjectModule],
  controllers: [CuratedIngestController],
  providers: [CuratedIngestService, IngestAuditService],
  exports: [CuratedIngestService],
})
export class CuratedIngestModule {}
