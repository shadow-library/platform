import { AppError, utils } from '@shadow-library/common';

import { MODULE_METADATA } from '../constants';
import { ModuleMetadata } from '../interfaces';

export function Module(metadata: ModuleMetadata = {}): ClassDecorator {
  return target => {
    const oldMetadata = Reflect.getMetadata(MODULE_METADATA, target);
    if (oldMetadata) throw AppError.internal(`Module metadata already declared for ${target.name}`);
    Reflect.defineMetadata(MODULE_METADATA, metadata, target);
    utils.object.deepFreeze(metadata);
  };
}
