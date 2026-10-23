import { Reflector } from '@shadow-library/common';

import { OPTIONAL_DEPS_METADATA } from '../constants';

export function Optional(): ParameterDecorator {
  return (target, _key, index) => Reflector.appendMetadata(OPTIONAL_DEPS_METADATA, index, target);
}
