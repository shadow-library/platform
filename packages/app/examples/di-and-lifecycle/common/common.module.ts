import { Module, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';

import { OutputService } from './output.service';
import { StorageService } from './storage.service';

@Module({
  providers: [OutputService, StorageService],
  exports: [OutputService, StorageService],
})
export class CommonModule implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(private readonly outputService: OutputService) {}

  onModuleInit(): void {
    this.outputService.info('CommonModule initialized');
  }

  onApplicationReady(): void {
    this.outputService.info('CommonModule application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('CommonModule application is stopping');
  }

  onModuleDestroy(): void {
    this.outputService.info('CommonModule destroyed');
  }
}
