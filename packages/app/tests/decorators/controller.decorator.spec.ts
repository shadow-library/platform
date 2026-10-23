import { describe, expect, it } from 'bun:test';

import { CONTROLLER_METADATA } from '@lib/constants';
import { Controller } from '@shadow-library/app';

describe('@controller', () => {
  const metadata = { action: 'controller-action' };

  @Controller(metadata)
  class TestController {}

  it('should set action metadata', () => {
    const controllerMetadata = Reflect.getMetadata(CONTROLLER_METADATA, TestController);
    expect(controllerMetadata).toStrictEqual(metadata);
  });
});
