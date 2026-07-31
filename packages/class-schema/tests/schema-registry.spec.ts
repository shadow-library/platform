/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ClassSchema, Field, Schema, SchemaRegistry } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  @Schema({ $id: UserPreferences.name })
  class UserPreferences {
    @Field()
    rememberMe: boolean;
  }

  @Schema()
  class UserLogin {
    @Field()
    username: string;

    @Field()
    password: string;

    @Field()
    preferences: UserPreferences;
  }

  beforeEach(() => (registry = new SchemaRegistry()));

  it('should add a schema', () => {
    registry.addSchema(UserLogin);
    const schema = registry.getSchema(UserLogin);
    expect(schema).toBeInstanceOf(ClassSchema);
  });

  it('should add a schema with a nested schema', () => {
    registry.addSchema(UserLogin);
    const schema = registry.getSchema(UserLogin);
    expect(registry['schemas'].size).toBe(2);
    expect(registry['schemas'].keys()).toContain(UserPreferences.name);
    expect(schema.getJSONSchema().definitions).toBeUndefined();
  });

  it('should return the same schema instance for the same class', () => {
    registry.addSchema(UserLogin);
    const schema1 = registry.getSchema(UserLogin);
    const schema2 = registry.getSchema(UserLogin);
    expect(schema1).toBe(schema2);
  });

  it('should add schema if it does not exist when getting schema', () => {
    const schema = registry.getSchema(UserLogin);
    expect(schema).toBeInstanceOf(ClassSchema);
  });

  it('should throw an error if the class is not a schema', () => {
    class User {
      name: string;
    }
    expect(() => registry.getSchema(User)).toThrowError();
  });
});
