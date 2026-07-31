/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AliasProvider, ClassProvider, FactoryProvider, Provider, ProviderToken, ValueProvider } from '../../interfaces';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function isClassProvider<T = any>(provider: Provider): provider is ClassProvider<T> {
  return 'useClass' in provider && typeof provider?.useClass === 'function';
}

export function isValueProvider<T = any>(provider: Provider): provider is ValueProvider<T> {
  return typeof provider === 'object' && 'useValue' in provider;
}

export function isFactoryProvider<T = any>(provider: Provider): provider is FactoryProvider<T> {
  return 'useFactory' in provider && typeof provider?.useFactory === 'function';
}

export function isAliasProvider(provider: Provider): provider is AliasProvider {
  return 'useExisting' in provider && typeof provider?.useExisting !== 'undefined';
}

export function getProviderToken(provider: Provider): ProviderToken {
  return typeof provider === 'function' ? provider : provider.token;
}
