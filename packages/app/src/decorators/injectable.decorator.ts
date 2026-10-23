import { INJECTABLE_METADATA } from '../constants';

export interface InjectableOptions {
  /**
   * Whether to initiate a new private instance of the provider for every use
   */
  transient?: boolean;
}

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return target => Reflect.defineMetadata(INJECTABLE_METADATA, options, target);
}
