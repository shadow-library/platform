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

@Injectable()
export class LoggerService {
  private readonly isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.NODE_ENV !== 'test';
  }

  log(message: string): void {
    if (!this.isEnabled) return;
    console.log(`[LOG] ${message}`);
  }
}
