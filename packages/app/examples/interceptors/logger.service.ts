/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

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
export class LoggerService {
  private readonly isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.NODE_ENV !== 'test';
  }

  /** This example is a standalone demo program, so its output is written straight to the stream rather than through a real logger. */
  private write(line: string): void {
    if (!this.isEnabled) return;
    process.stdout.write(`${line}\n`);
  }

  log(message: string): void {
    this.write(`[LOG] ${message}`);
  }

  /** Unprefixed on purpose — it separates the cache scenarios in the output rather than reporting one. */
  separator(): void {
    this.write(DIVIDER);
  }
}
