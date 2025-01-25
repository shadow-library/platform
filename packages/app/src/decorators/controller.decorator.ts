/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { CONTROLLER_METADATA } from '../constants';

/**
 * Defining types
 */

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
export interface ControllerMetdata extends Record<string | symbol, any> {}

/**
 * Declaring the constants
 */

export function Controller(metadata: ControllerMetdata = {}): ClassDecorator {
  return target => Reflect.defineMetadata(CONTROLLER_METADATA, metadata, target);
}
