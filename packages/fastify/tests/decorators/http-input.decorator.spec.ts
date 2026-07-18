/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_INPUTS } from '@lib/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const app = await import('@shadow-library/app');
const decorator = jest.fn();
const Handler = jest.fn(() => decorator);
mock.module('@shadow-library/app', () => ({ ...app, Handler }));
const { Body, Cookie, Ctx, Headers, HttpInput, Params, Query, RawBody, Req, Res, RouteInputType } = await import('@shadow-library/fastify');

describe('HTTP Input Decorators', () => {
  const schema = { type: 'string' } as any;

  @Schema()
  class Input {
    @Field()
    username: string;

    @Field()
    password: string;
  }

  class Controller {
    static params(@Params() _params: any) {}

    static req(@Req() _req: any) {}

    static res(@Res() _res: any) {}

    static headers(@Headers() _headers: any) {}

    static ctx(@Ctx() _ctx: any) {}
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should enhance the method with the request input metadata`, () => {
    class Controller {
      static single(@HttpInput(RouteInputType.BODY, schema) _body: any) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'single');
    expect(paramtypes).toStrictEqual(['body']);
    expect(Handler).toBeCalledWith({ schemas: { body: schema } });
  });

  it(`should enhance the method with the Body input metadata`, () => {
    class Controller {
      static body(_string: string, @Body() _body: Input) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'body');
    expect(paramtypes).toStrictEqual([, 'body']); // eslint-disable-line no-sparse-arrays
    expect(Handler).toBeCalledWith({ schemas: { body: Input } });
  });

  it(`should enhance the method with the Params input metadata`, () => {
    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'params');
    expect(paramtypes).toStrictEqual(['params']);
  });

  it(`should enhance the method with the Query input metadata`, () => {
    class Controller {
      static query(@Query() _params: object) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'query');
    expect(paramtypes).toStrictEqual(['query']);
    expect(Handler).toBeCalledWith({ schemas: { query: Object } });
  });

  it(`should enhance the method with the request input metadata`, () => {
    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'req');
    expect(paramtypes).toStrictEqual(['request']);
  });

  it(`should enhance the method with the response input metadata`, () => {
    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'res');
    expect(paramtypes).toStrictEqual(['response']);
  });

  it(`should enhance the method with the headers input metadata`, () => {
    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'headers');
    expect(paramtypes).toStrictEqual(['headers']);
  });

  it(`should enhance the method with the raw body input metadata and flag the route`, () => {
    class Controller {
      static raw(@RawBody() _raw: Buffer) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'raw');
    expect(paramtypes).toStrictEqual(['rawBody']);
    expect(Handler).toHaveBeenCalledWith({ rawBody: true });
  });

  it(`should enhance the method with the context input metadata`, () => {
    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'ctx');
    expect(paramtypes).toStrictEqual(['ctx']);
  });

  it(`should enhance the method with the cookies input metadata and flag the route`, () => {
    class Controller {
      static cookie(@Cookie() _cookies: Record<string, string>) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'cookie');
    expect(paramtypes).toStrictEqual(['cookies']);
    expect(Handler).toHaveBeenCalledWith({ cookies: true });
  });

  it(`should enhance the method with the multiple request input metadata`, () => {
    class Controller {
      static multiple(@HttpInput(RouteInputType.BODY) _body: object, _random: string, @HttpInput(RouteInputType.PARAMS, schema) _params: any) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'multiple');
    expect(paramtypes).toStrictEqual(['body', , 'params']); // eslint-disable-line no-sparse-arrays
    expect(Handler).toHaveBeenNthCalledWith(1, { schemas: { params: schema } });
    expect(Handler).toHaveBeenNthCalledWith(2, { schemas: { body: Object } });
  });
});
