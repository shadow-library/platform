/**
 * Importing npm packages
 */
import type { Config } from 'jest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const config: Config = {
  testEnvironment: 'node',
  testRegex: '.spec.ts$',
  detectOpenHandles: true,

  setupFiles: ['reflect-metadata'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: {
    '@lib/(.*)': '<rootDir>/src/$1',
    '@shadow-library/fastify': '<rootDir>/src',
  },

  collectCoverage: true,
  coverageReporters: process.env.CI ? ['text'] : ['text-summary', 'html-spa'],
  coverageThreshold: { global: { lines: 100, branches: 100, functions: 100, statements: 100 } },
  coveragePathIgnorePatterns: ['node_modules'],
};

export default config;
