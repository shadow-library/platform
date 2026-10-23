import { Class } from 'type-fest';

import { cloneClassSchema } from './mapped-types.utils';

export function PickType<T, K extends keyof T>(Class: Class<T>, keys: readonly K[]): Class<Pick<T, K>> {
  const filter = (key: string) => keys.includes(key as K);
  return cloneClassSchema(Class, {}, filter) as Class<Pick<T, K>>;
}
