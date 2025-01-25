/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { OPTIONAL_DEPS_METADATA } from '@lib/constants';
import { Optional } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Optional', () => {
  class Token {}
  class Test {
    constructor(
      public param: string,
      @Optional() public token: Token,
    ) {}
  }

  it('should enhance class with expected constructor params metadata', () => {
    const metadata = Reflect.getMetadata(OPTIONAL_DEPS_METADATA, Test);
    expect(metadata).toStrictEqual([1]);
  });
});
