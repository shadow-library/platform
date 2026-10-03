import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ActionRegistryModule } from '../refinement/action-registry.module';
import { RefinementModule } from '../refinement/refinement.module';
import { BibleDocumentController } from './document/bible-document.controller';
import { BibleDocumentService } from './document/bible-document.service';
import { EntityController } from './entity/entity.controller';
import { EntityService } from './entity/entity.service';
import { FactController } from './fact/fact.controller';
import { FactService } from './fact/fact.service';
import { MilestoneController } from './milestone/milestone.controller';
import { MilestoneService } from './milestone/milestone.service';
import { BibleOverviewController } from './overview/bible-overview.controller';
import { BibleOverviewService } from './overview/bible-overview.service';
import { PromiseController } from './promise/promise.controller';
import { PromiseService } from './promise/promise.service';
import { VolumeActionRegistrar } from './volume/volume-action.registrar';
import { VolumeController } from './volume/volume.controller';
import { VolumeService } from './volume/volume.service';

@Module({
  imports: [ActionRegistryModule, DatabaseModule, StorageModule, RefinementModule],
  controllers: [EntityController, VolumeController, BibleDocumentController, FactController, MilestoneController, PromiseController, BibleOverviewController],
  providers: [EntityService, VolumeService, BibleDocumentService, FactService, MilestoneService, PromiseService, BibleOverviewService, VolumeActionRegistrar],
  exports: [EntityService, VolumeService, BibleDocumentService, FactService, MilestoneService, PromiseService, BibleOverviewService],
})
export class BibleModule {}
