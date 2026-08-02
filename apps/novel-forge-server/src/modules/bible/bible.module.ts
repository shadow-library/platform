/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { ArcController } from './arc/arc.controller';
import { ArcService } from './arc/arc.service';
import { BibleDocumentController } from './document/bible-document.controller';
import { BibleDocumentService } from './document/bible-document.service';
import { EntityController } from './entity/entity.controller';
import { EntityService } from './entity/entity.service';
import { FactController } from './fact/fact.controller';
import { FactService } from './fact/fact.service';
import { VolumeController } from './volume/volume.controller';
import { VolumeService } from './volume/volume.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [EntityController, VolumeController, ArcController, BibleDocumentController, FactController],
  providers: [EntityService, VolumeService, ArcService, BibleDocumentService, FactService],
  exports: [EntityService, VolumeService, ArcService, BibleDocumentService, FactService],
})
export class BibleModule {}
