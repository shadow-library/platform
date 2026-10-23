import { INJECTABLE_METADATA } from '../constants';

export interface InjectableOptions {
  /** Creates a separate instance for every consumer; obtain one explicitly with `ModuleRef.resolve`. */
  transient?: boolean;
}

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return target => Reflect.defineMetadata(INJECTABLE_METADATA, options, target);
}
