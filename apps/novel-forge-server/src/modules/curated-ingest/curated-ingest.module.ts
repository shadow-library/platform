import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { ApiKeyModule } from '../api-key';
import { ProjectModule } from '../project';
import { TranslationModule } from '../translation/translation.module';
import { CuratedIngestController } from './curated-ingest.controller';
import { CuratedIngestService } from './curated-ingest.service';
import { IngestAuditService } from './ingest-audit.service';
import { OriginalsIngestController } from './originals-ingest.controller';

// ApiKeyModule is imported for its ApiKeyGuard, never re-listed in `controllers`: middlewares are
// app-global once registered, so a second listing would run the authentication hook twice per request.
// ProjectModule supplies ProjectService, whose `setCover` already owns the storage write and the
// content-addressed ref semantics the ingest cover push needs.
@Module({
  imports: [ActorModule, DatabaseModule, StorageModule, FastifyModule, ApiKeyModule, ProjectModule, TranslationModule],
  controllers: [CuratedIngestController, OriginalsIngestController],
  providers: [CuratedIngestService, IngestAuditService],
  exports: [CuratedIngestService],
})
export class CuratedIngestModule {}
