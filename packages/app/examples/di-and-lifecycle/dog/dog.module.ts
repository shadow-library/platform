/**
 * Importing npm packages
 */
import { Module, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit, forwardRef } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DogController } from './dog.controller';
import { DogService } from './dog.service';
import { CatModule } from '../cat/cat.module';
import { CommonModule } from '../common/common.module';
import { OutputService } from '../common/output.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [CommonModule, forwardRef(() => CatModule)],
  controllers: [DogController],
  providers: [DogService],
  exports: [DogService],
})
export class DogModule implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(private readonly outputService: OutputService) {}

  onModuleInit(): void {
    this.outputService.info('DogModule initialized');
  }

  onModuleDestroy(): void {
    this.outputService.info('DogModule destroyed');
  }

  onApplicationReady(): void {
    this.outputService.info('DogModule application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('DogModule application is stopping');
  }
}
