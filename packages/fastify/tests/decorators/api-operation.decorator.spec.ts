/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type ApiOperationMetadata } from '@shadow-library/fastify';

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
const { ApiOperation } = await import('@shadow-library/fastify');

describe('@ApiOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should enhance the method with the operation metadata', () => {
    const options: ApiOperationMetadata = {
      summary: 'Get user',
      description: 'Retrieve user information',
    };

    class TestController {
      @ApiOperation(options)
      getUser() {}
    }

    expect(Handler).toBeCalledWith({ operation: options }, { arrayStrategy: 'replace' });
  });

  it('should enhance the method with all operation metadata fields', () => {
    const options: ApiOperationMetadata = {
      summary: 'Create user',
      description: 'Create a new user',
      tags: ['users'],
      deprecated: false,
      externalDocs: {
        url: 'https://example.com/docs',
        description: 'External documentation',
      },
      security: {
        bearerAuth: [],
      },
    };

    class TestController {
      @ApiOperation(options)
      createUser() {}
    }

    expect(Handler).toBeCalledWith({ operation: options }, { arrayStrategy: 'replace' });
  });

  it('should enhance the method with minimal operation metadata', () => {
    const options: ApiOperationMetadata = {
      summary: 'Delete user',
    };

    class TestController {
      @ApiOperation(options)
      deleteUser() {}
    }

    expect(Handler).toBeCalledWith({ operation: options }, { arrayStrategy: 'replace' });
  });

  it('should enhance the method with tags metadata', () => {
    const options: ApiOperationMetadata = {
      summary: 'List users',
      tags: ['users', 'admin'],
    };

    class TestController {
      @ApiOperation(options)
      listUsers() {}
    }

    expect(Handler).toBeCalledWith({ operation: options }, { arrayStrategy: 'replace' });
  });

  it('should enhance the method with deprecated flag', () => {
    const options: ApiOperationMetadata = {
      summary: 'Old endpoint',
      deprecated: true,
    };

    class TestController {
      @ApiOperation(options)
      oldEndpoint() {}
    }

    expect(Handler).toBeCalledWith({ operation: options }, { arrayStrategy: 'replace' });
  });

  it('should enhance the method with custom metadata properties', () => {
    const options: ApiOperationMetadata = {
      summary: 'Custom endpoint',
      customField: 'custom value',
    };

    class TestController {
      @ApiOperation(options)
      customEndpoint() {}
    }

    expect(Handler).toBeCalledWith({ operation: options }, { arrayStrategy: 'replace' });
  });

  it('should enhance the method with operationId metadata', () => {
    const options: ApiOperationMetadata = {
      summary: 'Get user',
      operationId: 'getUser',
    };

    class TestController {
      @ApiOperation(options)
      getUser() {}
    }

    expect(Handler).toBeCalledWith({ operation: options }, { arrayStrategy: 'replace' });
  });
});
