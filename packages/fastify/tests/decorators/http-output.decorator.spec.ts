/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

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
const { Header, HttpStatus, Redirect, Render, RespondFor } = await import('@shadow-library/fastify');

describe('HTTP Output Decorators', () => {
  @Schema()
  class Input {
    @Field()
    name: string;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should enhance the method with the status metadata`, () => {
    class Controller {
      @HttpStatus(200)
      static single() {}
    }

    expect(Handler).toBeCalledWith({ status: 200 });
  });

  it(`should enhance the method with the headers metadata`, () => {
    const getContentLength = () => '20';
    class Controller {
      @Header('Content-Type', 'application/json')
      @Header('Content-Length', getContentLength)
      static single() {}
    }

    expect(Handler).toHaveBeenNthCalledWith(1, { headers: { 'Content-Type': 'application/json' } });
    expect(Handler).toHaveBeenNthCalledWith(2, { headers: { 'Content-Length': getContentLength } });
  });

  it(`should enhance the method with the redirect metadata`, () => {
    class Controller {
      @Redirect('/redirect')
      static single() {}
    }

    expect(Handler).toBeCalledWith({ redirect: '/redirect', status: 301 });
  });

  it(`should enhance the method with the render metadata`, () => {
    class Controller {
      @Render('view')
      static single() {}
    }

    expect(Handler).toBeCalledWith({ render: 'view' });
  });

  it(`should enhance the method with the render metadata with default data`, () => {
    class Controller {
      @Render()
      static single() {}
    }

    expect(Handler).toBeCalledWith({ render: true });
  });

  it('should enhance the method with response schema metadata', () => {
    class Controller {
      @RespondFor(200, Input)
      static single() {}
    }

    expect(Handler).toBeCalledWith({ schemas: { response: { 200: Input } } });
  });

  it('should enhance the method with multiple response schema metadata', () => {
    class Controller {
      @RespondFor(200, Input)
      @RespondFor(201, { type: 'object' })
      static single() {}
    }

    expect(Handler).toHaveBeenNthCalledWith(2, { schemas: { response: { 201: { type: 'object' } } } });
    expect(Handler).toHaveBeenNthCalledWith(1, { schemas: { response: { 200: Input } } });
  });
});
