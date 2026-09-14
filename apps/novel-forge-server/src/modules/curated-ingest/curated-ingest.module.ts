import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { ProjectModule } from '../project';
import { TranslationModule } from '../translation/translation.module';
import { CuratedIngestController } from './curated-ingest.controller';
import { CuratedIngestService } from './curated-ingest.service';
import { IngestAuditService } from './ingest-audit.service';
import { OriginalsIngestController } from './originals-ingest.controller';

// ProjectModule supplies ProjectService, whose `setCover` already owns the storage write and the
// content-addressed ref semantics the ingest cover push needs.
@Module({
  imports: [ActorModule, DatabaseModule, StorageModule, FastifyModule, ProjectModule, TranslationModule],
  controllers: [CuratedIngestController, OriginalsIngestController],
  providers: [CuratedIngestService, IngestAuditService],
  exports: [CuratedIngestService],
})
export class CuratedIngestModule {}
