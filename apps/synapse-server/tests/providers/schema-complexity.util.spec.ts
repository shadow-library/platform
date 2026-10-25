import { describe, expect, it } from 'bun:test';

import { optionalPropertyCount } from '@modules/providers/schema-complexity.util';

describe('optionalPropertyCount', () => {
  it('should count properties outside required at every nesting level', () => {
    const schema = {
      type: 'object',
      required: ['a'],
      properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'array', items: { type: 'object', properties: { d: {}, e: {} }, required: ['d'] } } },
    };

    expect(optionalPropertyCount(schema)).toBe(3);
  });

  it('should count a definition once however often it is referenced, and skip one never referenced', () => {
    const schema = {
      type: 'object',
      properties: { first: { $ref: '#/$defs/Op' }, second: { anyOf: [{ $ref: '#/$defs/Op' }, { type: 'null' }] } },
      required: ['first', 'second'],
      $defs: { Op: { type: 'object', properties: { x: {}, y: {} } }, Unused: { type: 'object', properties: { z: {} } } },
    };

    expect(optionalPropertyCount(schema)).toBe(2);
  });

  it('should count nothing for a value that is not a schema', () => {
    for (const value of [undefined, null, 'schema', 3]) expect(optionalPropertyCount(value)).toBe(0);
  });
});
