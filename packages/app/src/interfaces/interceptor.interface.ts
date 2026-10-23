import { Class, Promisable } from 'type-fest';

import { ProviderToken } from './provider.interface';

export interface InterceptorConfig<T = any> {
  /** Resolved from the DI container through `ModuleRef` */
  token: ProviderToken;

  options?: T;
}

export interface InterceptorContext {
  getClass<T extends object = any>(): Class<T>;

  getMethodName(): string;

  /** True when the intercepted method is async or declares a Promise return type */
  isPromise(): boolean;

  getOptions<T = any>(): T | undefined;

  getArgs<Args extends any[] = any[]>(): Args;
}

export interface CallHandler<T = unknown> {
  handle(): Promisable<T>;
}

export interface Interceptor {
  intercept(context: InterceptorContext, next: CallHandler): Promisable<unknown>;
}
