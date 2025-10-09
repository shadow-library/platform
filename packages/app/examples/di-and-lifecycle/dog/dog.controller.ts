/**
 * Importing npm packages
 */
import { Controller, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit, Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DogService } from './dog.service';
import { OutputService } from '../common/output.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Controller()
export class DogController implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(
    private readonly outputService: OutputService,
    private readonly dogService: DogService,
  ) {}

  onModuleInit(): void {
    this.outputService.info('DogController initialized');
  }

  onModuleDestroy(): void {
    this.outputService.info('DogController destroyed');
  }

  onApplicationReady(): void {
    this.outputService.info('DogController is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('DogController is stopping');
  }

  @Route({ method: 'GET', path: '/dogs/:id' })
  getDog(id: string): string {
    return this.dogService.getDog(id);
  }
}
