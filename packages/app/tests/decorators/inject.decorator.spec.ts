import { describe, expect, it } from 'bun:test';

import { SELF_DECLARED_DEPS_METADATA } from '@lib/constants';
import { Inject } from '@shadow-library/app';

describe('@Inject', () => {
  const symbol = Symbol('test');
  class Token {}
  class Test {
    constructor(
      @Inject('test') private param: string,
      @Inject(symbol) private param2: number,
      @Inject(Token) private param3: object,
    ) {}
  }

  it('should enhance class with expected constructor params metadata', () => {
    const metadata = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, Test);

    const expectedMetadata = [
      { index: 2, token: Token },
      { index: 1, token: symbol },
      { index: 0, token: 'test' },
    ];
    expect(metadata).toStrictEqual(expectedMetadata);
  });
});
