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
  testPathIgnorePatterns: ['e2e'],
  testRegex: '.spec.ts$',
  detectOpenHandles: true,

  setupFiles: ['reflect-metadata'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: {
    '@lib/(.*)': '<rootDir>/src/$1',
    '@shadow-library/app': '<rootDir>/src',
  },

  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: process.env.CI ? ['text'] : ['text-summary', 'html'],
  coverageThreshold: { global: { lines: 100, branches: 100, functions: 100, statements: 100 } },
  coveragePathIgnorePatterns: ['node_modules'],
};

export default config;
