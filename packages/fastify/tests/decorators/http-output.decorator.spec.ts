/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Route } from '@shadow-library/app';
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { Header, HttpStatus, Redirect, Render, RespondFor } from '@shadow-library/fastify';

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

    expect(Route).toBeCalledWith({ status: 200 });
  });

  it(`should enhance the method with the headers metadata`, () => {
    const getContentLength = () => '20';
    class Controller {
      @Header('Content-Type', 'application/json')
      @Header('Content-Length', getContentLength)
      static single() {}
    }

    expect(Route).toHaveBeenNthCalledWith(1, { headers: { 'Content-Type': 'application/json' } });
    expect(Route).toHaveBeenNthCalledWith(2, { headers: { 'Content-Length': getContentLength } });
  });

  it(`should enhance the method with the redirect metadata`, () => {
    class Controller {
      @Redirect('/redirect')
      static single() {}
    }

    expect(Route).toBeCalledWith({ redirect: '/redirect', status: 301 });
  });

  it(`should enhance the method with the render metadata`, () => {
    class Controller {
      @Render('view')
      static single() {}
    }

    expect(Route).toBeCalledWith({ render: 'view' });
  });

  it(`should enhance the method with the render metadata with default data`, () => {
    class Controller {
      @Render()
      static single() {}
    }

    expect(Route).toBeCalledWith({ render: true });
  });

  it('should enhance the method with response schema metadata', () => {
    class Controller {
      @RespondFor(200, Input)
      static single() {}
    }

    expect(Route).toBeCalledWith({ schemas: { response: { 200: Input } } });
  });

  it('should enhance the method with multiple response schema metadata', () => {
    class Controller {
      @RespondFor(200, Input)
      @RespondFor(201, { type: 'object' })
      static single() {}
    }

    expect(Route).toHaveBeenNthCalledWith(2, { schemas: { response: { 201: { type: 'object' } } } });
    expect(Route).toHaveBeenNthCalledWith(1, { schemas: { response: { 200: Input } } });
  });
});
