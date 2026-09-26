import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { RefinementModule } from '../refinement/refinement.module';
import { BibleDocumentController } from './document/bible-document.controller';
import { BibleDocumentService } from './document/bible-document.service';
import { EntityController } from './entity/entity.controller';
import { EntityService } from './entity/entity.service';
import { FactController } from './fact/fact.controller';
import { FactService } from './fact/fact.service';
import { MilestoneController } from './milestone/milestone.controller';
import { MilestoneService } from './milestone/milestone.service';
import { BibleReadinessController } from './readiness/bible-readiness.controller';
import { BibleReadinessService } from './readiness/bible-readiness.service';
import { VolumeActionRegistrar } from './volume/volume-action.registrar';
import { VolumeController } from './volume/volume.controller';
import { VolumeService } from './volume/volume.service';

@Module({
  imports: [DatabaseModule, StorageModule, RefinementModule],
  controllers: [EntityController, VolumeController, BibleDocumentController, FactController, MilestoneController, BibleReadinessController],
  providers: [EntityService, VolumeService, BibleDocumentService, FactService, MilestoneService, BibleReadinessService, VolumeActionRegistrar],
  exports: [EntityService, VolumeService, BibleDocumentService, FactService, MilestoneService, BibleReadinessService],
})
export class BibleModule {}
