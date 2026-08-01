/**
 * Importing npm packages
 */
import { Controller, Handler, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OutputService } from '../common/output.service';
import { CatService } from './cat.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Controller()
export class CatController implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(
    private readonly outputService: OutputService,
    private readonly catService: CatService,
  ) {}

  onModuleInit(): void {
    this.outputService.info('CatController initialized');
  }

  onModuleDestroy(): void {
    this.outputService.info('CatController destroyed');
  }

  onApplicationReady(): void {
    this.outputService.info('CatController is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('CatController is stopping');
  }

  @Handler({ method: 'GET', path: '/cats/:id' })
  getCat(id: string): string {
    return this.catService.getCat(id);
  }
}
