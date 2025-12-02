/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { objectUtils } from './object';
import { paginationUtils } from './pagination';
import { stringUtils } from './string';
import { temporalUtils } from './temporal';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

class Utils {
  readonly object = objectUtils;
  readonly string = stringUtils;
  readonly temporal = temporalUtils;
  readonly pagination = paginationUtils;

  /**
   * Validates the object.
   */
  isValid<T>(value: T): value is NonNullable<T> {
    if (value === undefined || value === null) return false;
    else if (typeof value === 'string') return !(value.trim() === '');
    else if (typeof value === 'number' && isNaN(value)) return false;
    return true;
  }
}

export const utils = new Utils();
