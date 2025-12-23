/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { ApiOperation, ApiOperationMetadata } from '@shadow-library/fastify';

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

    expect(Route).toBeCalledWith({ operation: options });
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

    expect(Route).toBeCalledWith({ operation: options });
  });

  it('should enhance the method with minimal operation metadata', () => {
    const options: ApiOperationMetadata = {
      summary: 'Delete user',
    };

    class TestController {
      @ApiOperation(options)
      deleteUser() {}
    }

    expect(Route).toBeCalledWith({ operation: options });
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

    expect(Route).toBeCalledWith({ operation: options });
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

    expect(Route).toBeCalledWith({ operation: options });
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

    expect(Route).toBeCalledWith({ operation: options });
  });
});
