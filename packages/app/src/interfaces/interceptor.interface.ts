/**
 * Importing npm packages
 */
import { Class, Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export interface InterceptorContext {
  /** Class whose method is being intercepted */
  getClass(): Class<unknown>;

  /** Name of the method which is being intercepted */
  getMethodName(): string;

  /** Denotes whether the intercepted method is a promise */
  isPromise(): boolean;
}

export interface CallHandler<T = unknown> {
  /** Method to handle the call */
  handle(): Promisable<T>;
}

export interface Interceptor {
  /** Method to intercept the call */
  intercept(context: InterceptorContext, next: CallHandler): Promisable<unknown>;
}
