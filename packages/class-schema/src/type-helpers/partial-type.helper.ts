import { Class } from 'type-fest';

import { cloneClassSchema } from './mapped-types.utils';

export function PartialType<T>(Class: Class<T>): Class<Partial<T>> {
  return cloneClassSchema(Class, { optional: true }) as Class<Partial<T>>;
}
