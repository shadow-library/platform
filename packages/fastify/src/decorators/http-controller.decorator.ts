/**
 * Importing npm packages
 */
import { Controller } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '../constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function HttpController(path = ''): ClassDecorator {
  if (path.charAt(0) !== '/') path = `/${path}`;
  return target => Controller({ [HTTP_CONTROLLER_TYPE]: 'router', path })(target);
}
