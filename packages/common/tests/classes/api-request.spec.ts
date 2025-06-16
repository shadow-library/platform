/**
 * Importing npm packages
 */
import { Mock, beforeEach, describe, expect, it, mock } from 'bun:test';

import { request } from 'undici';

/**
 * Importing user defined packages
 */
import { APIError, APIRequest, InternalError } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

mock.module('undici', () => ({ request: mock(() => Promise.resolve({ statusCode: 200, headers: {} })) }));

describe('APIRequest', () => {
  const mockRequest = request as Mock<any>;

  beforeEach(() => mock.restore());

  it('should create GET, POST, PUT, PATCH, DELETE instances', () => {
    expect(APIRequest.get('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.post('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.put('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.patch('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.delete('/test')).toBeInstanceOf(APIRequest);
  });

  it('should set headers, query, field, and body', async () => {
    const response = await APIRequest.post('/test').header('x-test', '1').query('sort', 'asc').body({ username: 'john-doe' }).field('name.first', 'John').field('name.last', 'Doe');
    expect(response).toStrictEqual({ statusCode: 200, headers: {}, data: null });
    expect(mockRequest).toHaveBeenCalledWith('/test', {
      method: 'POST',
      headers: { 'x-test': '1', 'content-type': 'application/json' },
      query: { sort: 'asc' },
      body: JSON.stringify({ username: 'john-doe', name: { first: 'John', last: 'Doe' } }),
    });
  });

  it('should suppress errors', async () => {
    mockRequest.mockResolvedValue({ statusCode: 400, headers: { 'content-type': 'application/json' }, body: { json: async () => ({ error: 'fail' }) } });
    const response = await APIRequest.get('/test').suppressErrors();
    expect(response).toStrictEqual({ statusCode: 400, headers: { 'content-type': 'application/json' }, data: { error: 'fail' } });
  });

  it('should throw APIError on failure if throwErrorOnFailure is true', async () => {
    mockRequest.mockResolvedValue({ statusCode: 400, headers: { 'content-type': 'application/json' }, body: { json: async () => ({ error: 'fail' }) } });
    await expect(APIRequest.get('/fail').header('x', 'y').body({}).execute()).rejects.toBeInstanceOf(APIError);
  });

  it('should create a child class with setOptions', () => {
    const Parent = APIRequest.get('/parent');
    const Child = Parent.child();
    Child.setOptions({ throwErrorOnFailure: false });
    const childInstance = new Child();
    expect(childInstance).toBeInstanceOf(APIRequest);
  });
});

describe('APIError', () => {
  it('should extend InternalError and set properties', () => {
    const err = new APIError(404, { msg: 'not found' });
    expect(err).toBeInstanceOf(InternalError);
    expect(err.statusCode).toBe(404);
    expect(err.data).toEqual({ msg: 'not found' });
    expect(err.message).toMatch(/404/);
  });
});
