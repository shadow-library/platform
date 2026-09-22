/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { Config, type ConfigRecords } from '../services/config.service';

/**
 * Defining types
 */

export type ConfigValues = { [K in keyof ConfigRecords]?: ConfigRecords[K] | undefined };

export type RestoreConfig = () => void;

/**
 * Declaring the constants
 */

/**
 * Sets config values for a test and returns the function that puts back exactly what was there before.
 * A value set ahead of `Config.register(...)` wins over the environment, because registration keeps an
 * already-cached value; `undefined` removes the key, as if it had never been configured.
 */
export function setConfig(values: ConfigValues): RestoreConfig {
  const cache = Config['cache'];
  const previous = new Map<keyof ConfigRecords, { present: boolean; value: unknown }>();

  for (const key of Object.keys(values) as (keyof ConfigRecords)[]) {
    previous.set(key, { present: cache.has(key), value: cache.get(key) });
    const value = values[key];
    if (value === undefined) cache.delete(key);
    else cache.set(key, value);
  }

  return () => {
    for (const [key, { present, value }] of previous) {
      if (present) cache.set(key, value);
      else cache.delete(key);
    }
  };
}
