/**
 * Importing npm packages
 */
import { type ForwardRef, Inject, Injectable, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit, forwardRef } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CatInternalService } from './cat-internal.service';
import { OutputService } from '../common/output.service';
import { StorageService } from '../common/storage.service';
import { DogService } from '../dog/dog.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class CatService implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  constructor(
    private readonly outputService: OutputService,
    private readonly storageService: StorageService,
    private readonly catInternalService: CatInternalService,
    @Inject(forwardRef(() => DogService)) private readonly dogService: ForwardRef<DogService>,
  ) {}

  onApplicationReady(): void {
    this.outputService.info('CatService application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('CatService application is stopping');
  }

  onModuleDestroy(): void {
    this.outputService.info('CatService destroyed');
  }

  onModuleInit(): void {
    this.outputService.info('CatService initialized');
  }

  getCat(id: string): string {
    return this.storageService.getItem(id);
  }

  setCat(id: string, cat: string): void {
    const oldCat = this.storageService.getItem(id);
    this.storageService.setItem(id, cat);
    if (oldCat) this.catInternalService.handleUpdateCat(cat);
    else this.catInternalService.handleNewCat(cat);
  }

  deleteCat(id: string): void {
    const oldCat = this.storageService.getItem(id);
    this.storageService.removeItem(id);
    if (oldCat) this.catInternalService.handleDeleteCat(oldCat);
  }

  attackDog(catId: string, dogId: string): void {
    const cat = this.getCat(catId);
    if (cat) this.dogService.removeDog(dogId);
  }
}
