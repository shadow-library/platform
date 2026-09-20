import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ArcController } from './arc/arc.controller';
import { ArcService } from './arc/arc.service';
import { BibleDocumentController } from './document/bible-document.controller';
import { BibleDocumentService } from './document/bible-document.service';
import { EntityController } from './entity/entity.controller';
import { EntityService } from './entity/entity.service';
import { FactController } from './fact/fact.controller';
import { FactService } from './fact/fact.service';
import { BibleReadinessController } from './readiness/bible-readiness.controller';
import { BibleReadinessService } from './readiness/bible-readiness.service';
import { VolumeController } from './volume/volume.controller';
import { VolumeService } from './volume/volume.service';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [EntityController, VolumeController, ArcController, BibleDocumentController, FactController, BibleReadinessController],
  providers: [EntityService, VolumeService, ArcService, BibleDocumentService, FactService, BibleReadinessService],
  exports: [EntityService, VolumeService, ArcService, BibleDocumentService, FactService, BibleReadinessService],
})
export class BibleModule {}
