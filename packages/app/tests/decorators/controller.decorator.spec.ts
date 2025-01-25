/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { CONTROLLER_METADATA } from '@lib/constants';
import { Controller } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@controller', () => {
  const metadata = { action: 'controller-action' };

  @Controller(metadata)
  class TestController {}

  it('should set action metadata', () => {
    const controllerMetadata = Reflect.getMetadata(CONTROLLER_METADATA, TestController);
    expect(controllerMetadata).toStrictEqual(metadata);
  });
});
