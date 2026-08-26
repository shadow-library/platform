import { describe, expect, it } from 'bun:test';
import { ClassSchema } from '@shadow-library/class-schema';

import { ListChangesQuery } from '@modules/refinement/refinement.dto';

const properties = (): Record<string, { default?: unknown }> => ClassSchema.generate(ListChangesQuery).properties as Record<string, { default?: unknown }>;

describe('ListChangesQuery', () => {
  it('should carry the page size the service actually uses, not the generic default', () => {
    expect(properties()['limit']?.default).toBe(30);
  });

  it('should advertise no sort fields, because the change feed orders by apply time by design', () => {
    expect(Object.keys(properties()).sort()).toEqual(['limit', 'offset']);
  });
});
