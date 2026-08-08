import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { PlanImportController } from './plan-import.controller';
import { PlanImportService } from './plan-import.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PlanImportController],
  providers: [PlanImportService],
  exports: [PlanImportService],
})
export class PlanImportModule {}
