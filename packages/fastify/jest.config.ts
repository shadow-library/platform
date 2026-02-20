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
  testPathIgnorePatterns: ['integration'],
  detectOpenHandles: true,

  setupFiles: ['reflect-metadata', '<rootDir>/tests/setup.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: { '@lib/(.*)': '<rootDir>/src/$1', '@shadow-library/fastify': '<rootDir>/src' },

  collectCoverage: true,
  coverageReporters: process.env.CI ? ['text'] : ['text-summary', 'html'],
  coverageThreshold: { global: { lines: 95, branches: 95, functions: 95, statements: 95 } },
  coveragePathIgnorePatterns: ['node_modules'],
};

export default config;
