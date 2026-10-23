import { describe, expect, it } from 'bun:test';

import { createContextId } from '@shadow-library/app';

describe('createContentId', () => {
  it('should return a random number', () => {
    const context = createContextId();
    expect(context).toMatchObject({ id: expect.any(Number) });
  });
});
