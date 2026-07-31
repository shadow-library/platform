/**
 * Importing npm packages
 */
import { type ForwardRef, Inject, Injectable, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit, Optional, forwardRef } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CatInternalService } from '../cat/cat-internal.service';
import { CatService } from '../cat/cat.service';
import { OutputService } from '../common/output.service';
import { StorageService } from '../common/storage.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class DogService implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(
    private readonly storageService: StorageService,
    private readonly outputService: OutputService,
    @Inject(forwardRef(() => CatService)) private readonly catService: ForwardRef<CatService>,
    @Optional() private readonly catInternalService: CatInternalService,
  ) {}

  onModuleInit(): void {
    this.outputService.info('DogService initialized');
  }

  onModuleDestroy(): void {
    this.outputService.info('DogService destroyed');
  }

  onApplicationReady(): void {
    this.outputService.info('DogService application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('DogService application is stopping');
  }

  getDog(id: string): string {
    return this.storageService.getItem(id);
  }

  setDog(id: string, name: string): void {
    this.storageService.setItem(id, name);
  }

  removeDog(id: string): void {
    const dog = this.storageService.getItem(id);
    if (dog) this.storageService.removeItem(id);
  }

  attackCat(dogId: string, catId: string): void {
    const dog = this.getDog(dogId);
    if (dog) this.catService.deleteCat(catId);
  }
}
