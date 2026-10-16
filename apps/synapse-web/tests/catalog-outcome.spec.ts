import { describe, expect, it } from 'bun:test';
import { isApiError } from '@shadow-library/web';

import { catalogWriteOutcome } from '../src/lib/apis/catalog-outcome';

const ISSUE = { path: 'aliases.opus.model', code: 'unknown_model', message: 'Unknown model "missing"' };

describe('catalogWriteOutcome', () => {
  it('should read a body without an error code as the written value, whatever fields it carries', () => {
    const saved = { draft: { version: 0 }, fingerprint: 'abc', issues: [ISSUE] };
    expect(catalogWriteOutcome(saved)).toEqual({ kind: 'done', value: saved });
  });

  it('should read the catalog-invalid error as its issues', () => {
    expect(catalogWriteOutcome({ code: 'SYN_CATALOG_INVALID', message: 'The catalog document is invalid', issues: [ISSUE] })).toEqual({ kind: 'invalid', issues: [ISSUE] });
  });

  it('should throw any other unprocessable error as an api error', () => {
    let thrown: unknown;
    try {
      catalogWriteOutcome({ code: 'VALIDATION_ERROR', message: 'body.document must be object', issues: [] });
    } catch (error) {
      thrown = error;
    }
    expect(isApiError(thrown) && thrown.status === 422 && thrown.code === 'VALIDATION_ERROR').toBe(true);
  });
});
