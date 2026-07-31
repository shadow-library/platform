/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { ClassSchema, Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { Body, FastifyModule, FastifyRouter, HttpController, Params, Post } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
class AddressDto {
  @Field({ minLength: 3, errorMessage: 'Enter a valid street' })
  street: string;
}

@Schema()
class RegisterDto {
  @Field({ minLength: 8, errorMessage: { minLength: 'Must be at least {limit} characters', required: 'Password is required' } })
  password: string;

  @Field({ optional: true, enum: ['male', 'female'], errorMessage: 'Choose a valid gender' })
  gender?: string;

  @Field(() => AddressDto)
  address: AddressDto;

  @Field({ optional: true, minLength: 2 })
  nickname?: string;
}

@Schema()
class ParamsDto {
  @Field({ pattern: '^[0-9a-f]{12}$', errorMessage: 'Invalid user id' })
  id: string;
}

@HttpController('/accounts')
class AccountsController {
  @Post('/register')
  register(@Body() body: RegisterDto) {
    return { password: body.password };
  }

  @Post('/:id/verify')
  verify(@Params() params: ParamsDto) {
    return { id: params.id };
  }
}

@Module({ imports: [FastifyModule.forRoot({ controllers: [AccountsController] })] })
class AccountsModule {}

describe('field errorMessage', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  const register = (body: object): Promise<any> => router.mockRequest().post('/accounts/register').body(body);
  const fieldsOf = (response: { json: () => any }): any => response.json().fields;

  beforeAll(async () => {
    app = await ShadowFactory.create(AccountsModule).then(instance => instance.start());
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(() => app.stop());

  /**
   * The key is neither declared nor understood by the schema generator, it only survives because unknown field options
   * are copied into the property schema. Pinning it here keeps a generator upgrade from silently muting every message.
   */
  it('should carry errorMessage through into the generated json schema', () => {
    const schema = ClassSchema.generate(RegisterDto);
    const definition = Object.values(schema.definitions ?? {})[0];
    expect(schema.properties?.password?.errorMessage).toStrictEqual({ minLength: 'Must be at least {limit} characters', required: 'Password is required' });
    expect(definition?.properties?.street?.errorMessage).toBe('Enter a valid street');
  });

  it('should return the errorMessage of the failing keyword', async () => {
    const response = await register({ password: 'short', address: { street: 'Main Street' } });
    expect(response.statusCode).toBe(422);
    expect(fieldsOf(response)).toStrictEqual([{ field: 'body.password', msg: 'Must be at least 8 characters' }]);
  });

  it('should return the errorMessage of a missing field against the field itself', async () => {
    const response = await register({ address: { street: 'Main Street' } });
    expect(response.statusCode).toBe(422);
    expect(fieldsOf(response)).toStrictEqual([{ field: 'body.password', msg: 'Password is required' }]);
  });

  it('should return the errorMessage of a nested field', async () => {
    const response = await register({ password: 'password', address: { street: 'Ma' } });
    expect(response.statusCode).toBe(422);
    expect(fieldsOf(response)).toStrictEqual([{ field: 'body.address.street', msg: 'Enter a valid street' }]);
  });

  it('should return the errorMessage without the allowed values suffix', async () => {
    const response = await register({ password: 'password', gender: 'other', address: { street: 'Main Street' } });
    expect(response.statusCode).toBe(422);
    expect(fieldsOf(response)).toStrictEqual([{ field: 'body.gender', msg: 'Choose a valid gender' }]);
  });

  it('should fall back to the ajv message for fields without an errorMessage', async () => {
    const response = await register({ password: 'password', nickname: 'a', address: { street: 'Main Street' } });
    expect(response.statusCode).toBe(422);
    expect(fieldsOf(response)).toStrictEqual([{ field: 'body.nickname', msg: 'must NOT have fewer than 2 characters' }]);
  });

  it('should return the errorMessage for path params', async () => {
    const response = await router.mockRequest().post('/accounts/123/verify');
    expect(response.statusCode).toBe(422);
    expect(fieldsOf(response)).toStrictEqual([{ field: 'params.id', msg: 'Invalid user id' }]);
  });

  it('should not leak the request data onto the error response', async () => {
    const response = await register({ password: 'sensitive-value', address: { street: 'Ma' } });
    expect(response.statusCode).toBe(422);
    expect(response.body).not.toContain('sensitive-value');
  });
});
