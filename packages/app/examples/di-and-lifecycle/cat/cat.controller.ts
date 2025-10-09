/**
 * Importing npm packages
 */
import { Controller, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit, Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CatService } from './cat.service';
import { OutputService } from '../common/output.service';

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

  @Route({ method: 'GET', path: '/cats/:id' })
  getCat(id: string): string {
    return this.catService.getCat(id);
  }
}
