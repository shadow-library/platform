import { AbstractClass, Class } from 'type-fest';

import { InjectionToken } from '../injection-token';

export type ClassToken<T = unknown> = Class<T> | AbstractClass<T>;

export type ProviderToken<T = unknown> = string | symbol | ClassToken<T> | InjectionToken<T>;

/** The class instance or `InjectionToken` payload a token resolves to; `unknown` for string and symbol tokens. */
export type TokenValue<Token> = Token extends InjectionToken<infer T> ? T : Token extends Class<infer T> ? T : Token extends AbstractClass<infer T> ? T : unknown;

export interface FactoryDependency {
  token: ProviderToken;
  optional: boolean;
}

export type Provider<T = any> = Class<T> | ClassProvider<T> | ValueProvider<T> | FactoryProvider<T> | AliasProvider;

export interface ClassProvider<T = any> {
  token: ProviderToken<T>;
  useClass: Class<T>;
  useValue?: never;
  inject?: never;
  useFactory?: never;
  useExisting?: never;
}

export interface ValueProvider<T = any> {
  token: ProviderToken<T>;
  useValue: T;
  useClass?: never;
  inject?: never;
  useFactory?: never;
  useExisting?: never;
}

export interface FactoryProvider<T = any> {
  token: ProviderToken<T>;

  /** Tokens passed to `useFactory` as positional arguments; wrap one in `FactoryDependency` to mark it optional. */
  inject?: (ProviderToken | FactoryDependency)[];
  useFactory: (...args: any[]) => T | Promise<T>;
  useClass?: never;
  useValue?: never;
  useExisting?: never;
}

export interface AliasProvider {
  token: ProviderToken;
  useExisting: ProviderToken;
  useClass?: never;
  useValue?: never;
  inject?: never;
  useFactory?: never;
}
