/**
 * Importing npm packages
 */
import { jest } from '@jest/globals';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

jest.mock('chokidar', () => ({
  watch: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })),
}));
