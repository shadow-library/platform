import { describe, expect, it } from 'bun:test';

import { ClassSchema, Field, PartialType, Schema } from '@shadow-library/class-schema';

describe('PartialType', () => {
  @Schema({ $id: User.name, additionalProperties: true, maxProperties: 5 })
  class User {
    @Field()
    firstName: string;

    @Field()
    lastName: string;

    @Field()
    email: string;
  }

  @Schema({ $id: PartialUser.name })
  class PartialUser extends PartialType(User) {}

  it('should create a partial type schema', () => {
    const partialUserSchema = new ClassSchema(PartialUser).getJSONSchema();
    expect(partialUserSchema).toEqual({
      $id: PartialUser.name,
      type: 'object',
      required: [],
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
      },
      additionalProperties: true,
      maxProperties: 5,
    });
  });
});
