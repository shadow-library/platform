/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, Mock, mock } from 'bun:test';
import { request } from 'undici';

/**
 * Importing user defined packages
 */
import { APIRequest, AppError, ErrorCode } from '@shadow-library/common';

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

  it('should accept an interface-typed body without casts', async () => {
    interface Payload {
      action: string;
      count: number;
    }
    const payload: Payload = { action: 'created', count: 1 };
    await APIRequest.post('/typed').body(payload);
    expect(mockRequest).toHaveBeenCalledWith('/typed', expect.objectContaining({ body: JSON.stringify(payload) }));
  });

  it('should throw AppError when the body is not JSON-serializable', async () => {
    await expect(
      APIRequest.post('/test')
        .body(() => 'not-json')
        .execute(),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('should suppress errors', async () => {
    mockRequest.mockResolvedValue({ statusCode: 400, headers: { 'content-type': 'application/json' }, body: { json: async () => ({ error: 'fail' }) } });
    const response = await APIRequest.get('/test').suppressErrors();
    expect(response).toStrictEqual({ statusCode: 400, headers: { 'content-type': 'application/json' }, data: { error: 'fail' } });
  });

  it('should throw API_REQUEST_FAILED on failure if throwErrorOnFailure is true', async () => {
    mockRequest.mockResolvedValue({ statusCode: 400, headers: { 'content-type': 'application/json' }, body: { json: async () => ({ error: 'fail' }) } });
    const failure = await APIRequest.get('/fail')
      .header('x', 'y')
      .body({})
      .execute()
      .catch((error: unknown) => error);
    expect(AppError.is(failure, ErrorCode.API_REQUEST_FAILED)).toBe(true);
    expect((failure as AppError).data).toStrictEqual({ status: 400, response: { error: 'fail' } });
  });

  it('should create a child class with setOptions', () => {
    const Parent = APIRequest.get('/parent');
    const Child = Parent.child();
    Child.setOptions({ throwErrorOnFailure: false });
    const childInstance = new Child();
    expect(childInstance).toBeInstanceOf(APIRequest);
  });
});
