/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ClassSchema, Field, PickType, Schema } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('PickType', () => {
  @Schema({ $id: User.name, additionalProperties: true, maxProperties: 5 })
  class User {
    @Field()
    firstName: string;

    @Field()
    lastName: string;

    @Field()
    email: string;
  }

  @Schema({ $id: UserProfile.name })
  class UserProfile extends PickType(User, ['firstName', 'lastName']) {
    @Field()
    age: number;
  }

  it('should create a schema picking the first and last name field', () => {
    const userProfileSchema = new ClassSchema(UserProfile).getJSONSchema();
    expect(userProfileSchema).toEqual({
      $id: UserProfile.name,
      type: 'object',
      required: ['firstName', 'lastName', 'age'],
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        age: { type: 'number' },
      },
      additionalProperties: true,
      maxProperties: 5,
    });
  });
});
