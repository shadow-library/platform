/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SchemaComposer } from '@lib/schema-composer';
import { ClassSchema, Field, Schema } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Schema Composer', () => {
  @Schema({ $id: NativeUser.name })
  class NativeUser {
    @Field({ const: 'native' })
    type: 'native';

    @Field()
    username: string;

    @Field()
    password: string;
  }

  @Schema({ $id: OAuthUser.name })
  class OAuthUser {
    @Field({ const: 'oauth' })
    type: 'oauth';

    @Field()
    username: string;

    @Field()
    provider: string;
  }

  const nativeUserSchema = {
    $id: NativeUser.name,
    type: 'object',
    required: ['type', 'username', 'password'],
    properties: {
      type: { type: 'string', const: 'native' },
      password: { type: 'string' },
      username: { type: 'string' },
    },
  };
  const oauthUserSchema = {
    $id: OAuthUser.name,
    type: 'object',
    required: ['type', 'username', 'provider'],
    properties: {
      type: { type: 'string', const: 'oauth' },
      provider: { type: 'string' },
      username: { type: 'string' },
    },
  };

  it('should generate the schema for anyOf', () => {
    const User = SchemaComposer.anyOf(NativeUser, OAuthUser);
    const schema = new ClassSchema(User);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: `class-schema:anyOf?Classes=${encodeURIComponent('NativeUser,OAuthUser')}`,
      type: 'object',
      anyOf: [{ $ref: NativeUser.name }, { $ref: OAuthUser.name }],
      definitions: { [NativeUser.name]: nativeUserSchema, [OAuthUser.name]: oauthUserSchema },
    });
  });

  it('should generate the schema for oneOf', () => {
    const User = SchemaComposer.oneOf(NativeUser, OAuthUser);
    const schema = new ClassSchema(User);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: `class-schema:oneOf?Classes=${encodeURIComponent('NativeUser,OAuthUser')}`,
      type: 'object',
      oneOf: [{ $ref: NativeUser.name }, { $ref: OAuthUser.name }],
      definitions: { [NativeUser.name]: nativeUserSchema, [OAuthUser.name]: oauthUserSchema },
    });
  });

  it('should generate the schema for discriminator', () => {
    const User = SchemaComposer.discriminator('type', NativeUser, OAuthUser);
    const schema = new ClassSchema(User);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: `class-schema:oneOf?Classes=${encodeURIComponent('NativeUser,OAuthUser')}&discriminatorKey=type`,
      type: 'object',
      oneOf: [{ $ref: NativeUser.name }, { $ref: OAuthUser.name }],
      discriminator: { propertyName: 'type' },
      definitions: { [NativeUser.name]: nativeUserSchema, [OAuthUser.name]: oauthUserSchema },
    });
  });
});
