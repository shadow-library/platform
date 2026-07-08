/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { ArcController } from './arc/arc.controller';
import { ArcService } from './arc/arc.service';
import { BibleDocumentController } from './document/bible-document.controller';
import { BibleDocumentService } from './document/bible-document.service';
import { EntityController } from './entity/entity.controller';
import { EntityService } from './entity/entity.service';
import { VolumeController } from './volume/volume.controller';
import { VolumeService } from './volume/volume.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [EntityController, VolumeController, ArcController, BibleDocumentController],
  providers: [EntityService, VolumeService, ArcService, BibleDocumentService],
  exports: [EntityService, VolumeService, ArcService, BibleDocumentService],
})
export class BibleModule {}
