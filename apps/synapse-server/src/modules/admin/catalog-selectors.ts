import { AppErrorCode } from '@server/classes';

import { type Selectors } from '@modules/catalog';

import { MAX_SELECTOR_PAIRS, SELECTOR_TOKEN } from './admin.constants';

/** Null-prototype, so a selector named `__proto__` is an ordinary key rather than a way to reach the prototype chain. */
export function parseSelectors(raw: string | undefined): Selectors {
  const selectors = Object.create(null) as Selectors;
  if (raw === undefined || raw === '') return selectors;

  const pairs = raw.split(',');
  if (pairs.length > MAX_SELECTOR_PAIRS) throw AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'selectors', reason: 'too many selectors' });
  for (const pair of pairs) {
    const separator = pair.indexOf(':');
    const key = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const valid = separator > 0 && SELECTOR_TOKEN.test(key) && SELECTOR_TOKEN.test(value) && !Object.hasOwn(selectors, key);
    if (!valid) throw AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'selectors', reason: 'expected unique key:value pairs separated by commas' });
    selectors[key] = value;
  }
  return selectors;
}
