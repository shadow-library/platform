/**
 * Importing npm packages
 */
import { AbstractClass, Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { InjectionToken } from '../injection-token';

/**
 * Defining types
 */
export type ClassToken<T = unknown> = Class<T> | AbstractClass<T>;

export type ProviderToken<T = unknown> = string | symbol | ClassToken<T> | InjectionToken<T>;

/**
 * The value type a token resolves to: the instance of a class token, or the payload of an InjectionToken.
 * Falls back to `unknown` for untyped string/symbol tokens.
 */
export type TokenValue<Token> = Token extends InjectionToken<infer T> ? T : Token extends Class<infer T> ? T : Token extends AbstractClass<infer T> ? T : unknown;

export interface FactoryDependency {
  token: ProviderToken;
  optional: boolean;
}

export type Provider<T = any> = Class<T> | ClassProvider<T> | ValueProvider<T> | FactoryProvider<T> | AliasProvider;

export interface ClassProvider<T = any> {
  /**
   * Injection token
   */
  token: ProviderToken<T>;

  /**
   * Type (class name) of provider (instance to be injected).
   */
  useClass: Class<T>;

  /**
   * This option is only available on value providers!
   */
  useValue?: never;

  /**
   * This option is only available on factory providers!
   */
  inject?: never;

  /**
   * This option is only available on factory providers!
   */
  useFactory?: never;

  /**
   * This option is only available on alias providers!
   */
  useExisting?: never;
}

export interface ValueProvider<T = any> {
  /**
   * Injection token
   */
  token: ProviderToken<T>;

  /**
   * Instance of a provider to be injected.
   */
  useValue: T;

  /**
   * This option is only available on class providers!
   */
  useClass?: never;

  /**
   * This option is only available on factory providers!
   */
  inject?: never;

  /**
   * This option is only available on factory providers!
   */
  useFactory?: never;

  /**
   * This option is only available on alias providers!
   */
  useExisting?: never;
}

export interface FactoryProvider<T = any> {
  /**
   * Injection token
   */
  token: ProviderToken<T>;

  /**
   * Optional list of providers to be injected into the context of the Factory function.
   */
  inject?: (ProviderToken | FactoryDependency)[];

  /**
   * Factory function that returns an instance of the provider to be injected.
   */
  useFactory: (...args: any[]) => T | Promise<T>;

  /**
   * This option is only available on class providers!
   */
  useClass?: never;

  /**
   * This option is only available on value providers!
   */
  useValue?: never;

  /**
   * This option is only available on alias providers!
   */
  useExisting?: never;
}

export interface AliasProvider {
  /**
   * Injection token
   */
  token: ProviderToken;

  /**
   * The token to which the injection is aliased.
   */
  useExisting: ProviderToken;

  /**
   * This option is only available on class providers!
   */
  useClass?: never;

  /**
   * This option is only available on value providers!
   */
  useValue?: never;

  /**
   * This option is only available on factory providers!
   */
  inject?: never;

  /**
   * This option is only available on factory providers!
   */
  useFactory?: never;
}
