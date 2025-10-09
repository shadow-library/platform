/**
 * Importing npm packages
 */
import { Module, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit, forwardRef } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CatInternalService } from './cat-internal.service';
import { CatController } from './cat.controller';
import { CatService } from './cat.service';
import { CommonModule } from '../common/common.module';
import { OutputService } from '../common/output.service';
import { DogModule } from '../dog/dog.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [CommonModule, forwardRef(() => DogModule)],
  controllers: [CatController],
  providers: [CatService, CatInternalService, { token: 'CAT_OPTIONS', useValue: { option1: 'value1', option2: 'value2' } }],
  exports: [CatService],
})
export class CatModule implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(private readonly outputService: OutputService) {}

  onModuleInit(): void {
    this.outputService.info('CatModule initialized');
  }

  onApplicationReady(): void {
    this.outputService.info('CatModule application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('CatModule application is stopping');
  }

  onModuleDestroy(): void {
    this.outputService.info('CatModule destroyed');
  }
}
