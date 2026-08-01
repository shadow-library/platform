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

const DIVIDER = '-'.repeat(60);

@Injectable()
export class OutputService implements OnModuleInit, OnModuleDestroy, OnApplicationReady, OnApplicationStop {
  /** These examples are standalone demo programs, so their output is written straight to the stream rather than through a real logger. */
  private log(message: string): void {
    process.stdout.write(`${message}\n`);
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

  /** Unprefixed on purpose — it separates lifecycle phases in the output rather than reporting one. */
  separator(): void {
    this.log(DIVIDER);
  }
}
