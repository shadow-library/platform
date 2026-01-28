/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ClassSchema, Field, Schema, SchemaComposer } from '@shadow-library/class-schema';

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

  @Schema({ $id: Account.name })
  class Account {
    @Field()
    id: string;

    @Field(() => SchemaComposer.oneOf(NativeUser, OAuthUser))
    admin: NativeUser | OAuthUser;

    @Field(() => [SchemaComposer.discriminator('type', NativeUser, OAuthUser)])
    users: (NativeUser | OAuthUser)[];
  }

  const nativeUserSchema = {
    $id: NativeUser.name,
    type: 'object',
    required: ['type', 'username', 'password'],
    additionalProperties: false,
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
    additionalProperties: false,
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
      additionalProperties: false,
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
      additionalProperties: false,
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
      additionalProperties: false,
      oneOf: [{ $ref: NativeUser.name }, { $ref: OAuthUser.name }],
      discriminator: { propertyName: 'type', mapping: { native: NativeUser.name, oauth: OAuthUser.name } },
      definitions: { [NativeUser.name]: nativeUserSchema, [OAuthUser.name]: oauthUserSchema },
    });
  });

  it('should generate the schema for discriminator in a nested field', () => {
    const schema = new ClassSchema(Account);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: Account.name,
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        admin: { $ref: 'class-schema:oneOf?Classes=NativeUser%2COAuthUser' },
        users: { type: 'array', items: { $ref: 'class-schema:oneOf?Classes=NativeUser%2COAuthUser&discriminatorKey=type' } },
      },
      required: ['id', 'admin', 'users'],
      definitions: {
        'class-schema:oneOf?Classes=NativeUser%2COAuthUser': {
          $id: 'class-schema:oneOf?Classes=NativeUser%2COAuthUser',
          type: 'object',
          additionalProperties: false,
          oneOf: [{ $ref: 'NativeUser' }, { $ref: 'OAuthUser' }],
        },
        'class-schema:oneOf?Classes=NativeUser%2COAuthUser&discriminatorKey=type': {
          $id: 'class-schema:oneOf?Classes=NativeUser%2COAuthUser&discriminatorKey=type',
          type: 'object',
          additionalProperties: false,
          discriminator: { propertyName: 'type', mapping: { native: 'NativeUser', oauth: 'OAuthUser' } },
          oneOf: [{ $ref: 'NativeUser' }, { $ref: 'OAuthUser' }],
        },
        NativeUser: {
          $id: 'NativeUser',
          type: 'object',
          required: ['type', 'username', 'password'],
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'native' },
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
        OAuthUser: {
          $id: 'OAuthUser',
          type: 'object',
          required: ['type', 'username', 'provider'],
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'oauth' },
            username: { type: 'string' },
            provider: { type: 'string' },
          },
        },
      },
    });
  });

  it('should generate the schema for string enum', () => {
    const Status = SchemaComposer.enum('Status', ['active', 'inactive', 'pending']);

    expect(Status).toMatchObject({
      id: expect.stringContaining('class-schema:Status-enum-'),
      values: ['active', 'inactive', 'pending'],
      type: 'string',
    });
  });

  it('should generate the schema for number enum', () => {
    const Status = SchemaComposer.enum('Status', [1, 2, 3, 4, 5]);

    expect(Status).toMatchObject({
      id: expect.stringContaining('class-schema:Status-enum-'),
      values: [1, 2, 3, 4, 5],
      type: 'number',
    });
  });
});
