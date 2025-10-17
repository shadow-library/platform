/**
 * Importing npm packages
 */
import { InternalError, utils } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { MODULE_METADATA } from '../constants';
import { ModuleMetadata } from '../interfaces';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function Module(metadata: ModuleMetadata): ClassDecorator {
  return target => {
    const oldMetadata = Reflect.getMetadata(MODULE_METADATA, target);
    if (oldMetadata) throw new InternalError(`Module metadata already declared for ${target.name}`);
    Reflect.defineMetadata(MODULE_METADATA, metadata, target);
    utils.object.deepFreeze(metadata);
  };
}
