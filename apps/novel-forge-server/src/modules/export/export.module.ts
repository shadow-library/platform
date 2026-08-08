import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { ExportController } from './export.controller';
import { NovelPackageService } from './novel-package.service';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [ExportController],
  providers: [NovelPackageService],
  exports: [NovelPackageService],
})
export class ExportModule {}
