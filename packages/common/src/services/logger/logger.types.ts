/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface LoggerInstance {
  verbose(message: string, ...meta: any[]): void;
  debug(message: string, ...meta: any[]): void;
  info(message: string, ...meta: any[]): void;
  http(message: string, ...meta: any[]): void;
  warn(message: string, ...meta: any[]): void;
  error(message: string, ...meta: any[]): void;
}

/**
 * Declaring the constants
 */
