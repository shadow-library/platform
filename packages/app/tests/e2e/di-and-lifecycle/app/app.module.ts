/**
 * Importing npm packages
 */
import { Module, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CatModule } from './cat/cat.module';
import { CommonModule } from './common/common.module';
import { OutputService } from './common/output.service';
import { DogModule } from './dog/dog.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [CommonModule, CatModule, DogModule],
})
export class AppModule implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(private readonly outputService: OutputService) {}

  onModuleInit(): void {
    this.outputService.info('AppModule initialized');
  }

  onModuleDestroy(): void {
    this.outputService.info('AppModule destroyed');
  }

  onApplicationReady(): void {
    this.outputService.info('AppModule application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('AppModule application is stopping');
  }
}
