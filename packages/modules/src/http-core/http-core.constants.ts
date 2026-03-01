/**
 * Importing npm packages
 */
import { Config, ConfigOptions, ConfigRecords } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
export const HTTP_CORE_CONFIGS = Symbol('HTTP_CORE_CONFIGS');
export const LOGGER_NAMESPACE = '@shadow-library/modules/http-core';

export const DEFAULT_CONFIGS = {
  'http-core.csrf.enabled': { validateType: 'boolean', defaultValue: 'true' },
  'http-core.helmet.enabled': { validateType: 'boolean' },
  'http-core.compress.enabled': { validateType: 'boolean' },
  'http-core.openapi.enabled': { validateType: 'boolean' },

  'health.host': { defaultValue: 'localhost' },
  'health.port': { validateType: 'number', defaultValue: '8081' },
  'health.enabled': { validateType: 'boolean', defaultValue: Config.isProd() ? 'true' : 'false' },
} as const satisfies Partial<Record<keyof ConfigRecords, ConfigOptions>>;
