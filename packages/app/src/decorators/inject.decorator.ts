import { Reflector } from '@shadow-library/common';

import { SELF_DECLARED_DEPS_METADATA } from '../constants';
import { ProviderToken } from '../interfaces';
import { ForwardReference } from '../utils';

export interface InjectMetadata {
  token: ProviderToken | ForwardReference<ProviderToken>;
  index: number;
}

export function Inject(token: InjectMetadata['token']): ParameterDecorator {
  return (target, _key, index) => Reflector.appendMetadata(SELF_DECLARED_DEPS_METADATA, { index, token }, target);
}
