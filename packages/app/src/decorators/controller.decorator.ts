import { Reflector } from '@shadow-library/common';

import { CONTROLLER_METADATA } from '../constants';

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
export interface ControllerMetadata extends Record<string | symbol, any> {}

export function Controller(metadata: ControllerMetadata = {}): ClassDecorator {
  return target => Reflector.updateMetadata(CONTROLLER_METADATA, metadata, target);
}
