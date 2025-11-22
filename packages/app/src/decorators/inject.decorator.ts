/**
 * Importing npm packages
 */
import { Reflector } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { SELF_DECLARED_DEPS_METADATA } from '../constants';
import { InjectionToken } from '../interfaces';
import { ForwardReference } from '../utils';

/**
 * Defining types
 */

export interface InjectMetadata {
  token: InjectionToken | ForwardReference<InjectionToken>;
  index: number;
}

/**
 * Declaring the constants
 */

export function Inject(token: InjectMetadata['token']): ParameterDecorator {
  return (target, _key, index) => Reflector.appendMetadata(SELF_DECLARED_DEPS_METADATA, { index, token }, target);
}
