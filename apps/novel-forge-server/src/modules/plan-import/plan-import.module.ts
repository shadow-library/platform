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
import { PlanImportController } from './plan-import.controller';
import { PlanImportService } from './plan-import.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [PlanImportController],
  providers: [PlanImportService],
  exports: [PlanImportService],
})
export class PlanImportModule {}
