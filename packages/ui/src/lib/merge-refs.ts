/**
 * Importing npm packages
 */
import { type Ref } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Merges several refs into one callback ref so a component can both forward a caller's ref and
 * keep its own internal handle to the same node.
 */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): (node: T | null) => void {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref != null) (ref as { current: T | null }).current = node;
    }
  };
}
