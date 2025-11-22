/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AliasProvider, ClassProvider, FactoryProvider, Provider, ValueProvider } from '../../interfaces';

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
  return 'useValue' in provider && typeof provider?.useValue !== 'undefined';
}

export function isFactoryProvider<T = any>(provider: Provider): provider is FactoryProvider<T> {
  return 'useFactory' in provider && typeof provider?.useFactory === 'function';
}

export function isAliasProvider(provider: Provider): provider is AliasProvider {
  return 'useExisting' in provider && typeof provider?.useExisting !== 'undefined';
}
