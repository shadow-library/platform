/**
 * Importing npm packages
 */
import { Injectable, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OutputService } from './output.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable({ transient: true })
export class StorageService implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  private readonly storage = new Map<string, any>();

  constructor(private readonly outputService: OutputService) {}

  onModuleInit(): void {
    this.outputService.info('StorageService initialized');
  }

  onModuleDestroy(): void {
    this.outputService.info('StorageService destroyed');
  }

  onApplicationReady(): void {
    this.outputService.info('StorageService application is ready');
  }

  onApplicationStop(): void {
    this.outputService.info('StorageService application is stopping');
  }

  setItem(key: string, value: unknown): void {
    this.outputService.debug(`Setting item: ${key}`);
    this.storage.set(key, value);
  }

  getItem(key: string): any {
    this.outputService.debug(`Getting item: ${key}`);
    return this.storage.get(key);
  }

  removeItem(key: string): void {
    this.outputService.debug(`Removing item: ${key}`);
    this.storage.delete(key);
  }

  clear(): void {
    this.outputService.debug(`Clearing storage`);
    this.storage.clear();
  }
}
