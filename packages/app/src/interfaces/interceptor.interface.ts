/**
 * Importing npm packages
 */
import { Class, Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
import { InjectionToken } from './provider.interface';

/**
 * Defining types
 */

export interface InterceptorConfig<T = any> {
  /** The interceptor token to be resolved from the dependency injection container */
  token: InjectionToken;

  /** Optional configuration options for the interceptor */
  options?: T;
}

/**
 * Declaring the constants
 */

export interface InterceptorContext {
  /** Class whose method is being intercepted */
  getClass<T extends object = any>(): Class<T>;

  /** Name of the method which is being intercepted */
  getMethodName(): string;

  /** Denotes whether the intercepted method is a promise */
  isPromise(): boolean;

  /** Get the interceptor options if any */
  getOptions<T = any>(): T | undefined;

  /** Get the arguments passed to the intercepted method */
  getArgs<Args extends any[] = any[]>(): Args;
}

export interface CallHandler<T = unknown> {
  /** Method to handle the call */
  handle(): Promisable<T>;
}

export interface Interceptor {
  /** Method to intercept the call */
  intercept(context: InterceptorContext, next: CallHandler): Promisable<unknown>;
}
