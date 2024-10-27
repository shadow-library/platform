/**
 * Importing npm packages.
 */
import type { Config } from 'jest';

/**
 * Defining types
 */

/**
 * Declaring the constants.
 */

const config: Config = {
  displayName: 'class-schema',
  testEnvironment: 'node',
  testRegex: '.spec.ts$',
  detectOpenHandles: true,

  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: false }] },
  moduleNameMapper: {
    '@shadow-library/class-schema': '<rootDir>/src/index.ts',
    '@lib/(.*)': '<rootDir>/src/$1',
  },

  collectCoverage: true,
  coverageReporters: process.env.CI ? ['text'] : ['text-summary', 'html'],
  coverageThreshold: { global: { lines: 100, branches: 100, functions: 100, statements: 100 } },
  coveragePathIgnorePatterns: ['node_modules'],
};

export default config;
