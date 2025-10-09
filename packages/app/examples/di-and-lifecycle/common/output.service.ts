/**
 * Importing npm packages
 */
import { Injectable, OnApplicationReady, OnApplicationStop, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class OutputService implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  private log(message: string): void {
    console.log(message); // eslint-disable-line no-console
  }

  onModuleInit(): void {
    this.log(`[INFO] OutputService initialized`);
  }

  onModuleDestroy(): void {
    this.log(`[INFO] OutputService destroyed`);
  }

  onApplicationReady(): void {
    this.log(`[INFO] OutputService application is ready`);
  }

  onApplicationStop(): void {
    this.log(`[INFO] OutputService application is stopping`);
  }

  debug(message: string): void {
    this.log(`[DEBUG] ${message}`);
  }

  info(message: string): void {
    this.log(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.log(`[WARN] ${message}`);
  }

  error(message: string): void {
    this.log(`[ERROR] ${message}`);
  }
}
