/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface ApiOperationMetadata {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  externalDocs?: {
    url: string;
    description?: string;
  };
  security?: Record<string, string[]>;
  [key: string]: any;
}

/**
 * Declaring the constants
 */

export function ApiOperation(options: ApiOperationMetadata): ClassDecorator & MethodDecorator {
  return Handler({ operation: options }, { arrayStrategy: 'replace' });
}
