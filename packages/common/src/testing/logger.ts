/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { Logger } from '../services/logger/logger.service';

/**
 * Defining types
 */

export type RestoreLogger = () => void;

/**
 * Declaring the constants
 */

/**
 * Mutes every logger, including child loggers created earlier and transports attached later, and returns
 * the function that restores the previous state. It stops writes, not construction: a `file:json`
 * transport still creates its log directory when attached, so tests must not attach one at all.
 */
export function silenceLogger(): RestoreLogger {
  const logger = Logger['logger'];
  const wasSilent = logger.silent;
  logger.silent = true;
  return () => void (logger.silent = wasSilent);
}
