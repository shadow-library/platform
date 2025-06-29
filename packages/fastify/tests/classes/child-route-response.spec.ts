/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { ChildRouteResponse } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ChildRouteResponse', () => {
  let res: ChildRouteResponse;

  beforeEach(() => {
    res = new ChildRouteResponse();
  });

  it('should have default values', () => {
    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual({});
    expect(res.body).toEqual({});
    expect(res.sent).toBe(false);
  });

  it('should set status code', () => {
    expect(res.status(404)).toBe(res);
    expect(res.statusCode).toBe(404);
  });

  it('should set headers', () => {
    expect(res.header('x-test', 'abc')).toBe(res);
    expect(res.headers['x-test']).toBe('abc');
  });

  it('should send body and mark as sent', () => {
    const data = { foo: 'bar' };
    expect(res.send(data)).toBe(res);
    expect(res.body).toBe(data);
    expect(res.sent).toBe(true);
  });

  it('should return result object', () => {
    res.status(201).header('x', 'y').send({ a: 1 });
    expect(res.getResult()).toEqual({ statusCode: 201, headers: { x: 'y' }, body: { a: 1 } });
  });

  it('should set onFinish callback for finish event', () => {
    const cb = jest.fn();
    res.raw.on('finish', cb);
    expect(res.onFinish).toBe(cb);
  });

  it('should log warning for unhandled event', () => {
    const warnSpy = jest.spyOn(ChildRouteResponse['logger'], 'warn').mockImplementation(() => {});
    res.raw.on('close', () => {});
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled event: close'));
    warnSpy.mockRestore();
  });
});
