import { Inject, Injectable, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit, Optional } from '@shadow-library/app';

import { OutputService } from '../common/output.service';

@Injectable()
export class CatInternalService implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(
    private readonly outputService: OutputService,
    @Optional() @Inject('CAT_OPTIONS') private readonly catOptions: Record<string, string>,
  ) {}

  onModuleInit(): void {
    this.outputService.info('CatInternalService initialized');
  }

  onModuleDestroy(): void {
    this.outputService.info('CatInternalService destroyed');
  }

  onApplicationReady(): void {
    this.outputService.info('CatInternalService application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('CatInternalService application is stopping');
  }

  handleNewCat(cat: string): void {
    this.outputService.info(`New cat added: ${cat}`);
  }

  handleDeleteCat(cat: string): void {
    this.outputService.warn(`Cat deleted: ${cat}`);
  }

  handleUpdateCat(cat: string): void {
    this.outputService.info(`Cat updated: ${cat}`);
  }
}
