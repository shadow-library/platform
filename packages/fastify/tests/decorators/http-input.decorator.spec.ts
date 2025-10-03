/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Route } from '@shadow-library/app';
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_INPUTS } from '@lib/constants';
import { Body, HttpInput, Params, Query, Req, Res, RouteInputType } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const decorator = jest.fn();
jest.mock('@shadow-library/app', () => {
  const actual = jest.requireActual('@shadow-library/app') as object;
  return { ...actual, Route: jest.fn(() => decorator) };
});

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
    expect(Route).toBeCalledWith({ schemas: { body: schema } });
  });

  it(`should enhance the method with the Body input metadata`, () => {
    class Controller {
      static body(_string: string, @Body() _body: Input) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'body');
    expect(paramtypes).toStrictEqual([, 'body']); // eslint-disable-line no-sparse-arrays
    expect(Route).toBeCalledWith({ schemas: { body: Input } });
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
    expect(Route).toBeCalledWith({ schemas: { query: Object } });
  });

  it(`should enhance the method with the request input metadata`, () => {
    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'req');
    expect(paramtypes).toStrictEqual(['request']);
  });

  it(`should enhance the method with the response input metadata`, () => {
    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'res');
    expect(paramtypes).toStrictEqual(['response']);
  });

  it(`should enhance the method with the multiple request input metadata`, () => {
    class Controller {
      static multiple(@HttpInput(RouteInputType.BODY) _body: object, _random: string, @HttpInput(RouteInputType.PARAMS, schema) _params: any) {}
    }

    const paramtypes = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, Controller, 'multiple');
    expect(paramtypes).toStrictEqual(['body', , 'params']); // eslint-disable-line no-sparse-arrays
    expect(Route).toHaveBeenNthCalledWith(1, { schemas: { params: schema } });
    expect(Route).toHaveBeenNthCalledWith(2, { schemas: { body: Object } });
  });
});
