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
import { StorageModule } from '../storage/storage.module';
import { ExportController } from './export.controller';
import { NovelPackageService } from './novel-package.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [ExportController],
  providers: [NovelPackageService],
  exports: [NovelPackageService],
})
export class ExportModule {}
