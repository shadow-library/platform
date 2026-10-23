import { Class } from 'type-fest';

import { ProviderToken, TokenValue } from '../interfaces';
import { ContextId } from '../utils';

export abstract class ModuleRef {
  /**
   * Retrieves an instance of a provider, otherwise throws an exception.
   * The return type is inferred from the token when it is a class or a typed InjectionToken.
   */
  abstract get<Token extends ProviderToken>(token: Token): TokenValue<Token>;

  /**
   * Resolves a transient instance of a provider, otherwise throws an exception.
   */
  abstract resolve<T>(typeOrToken: Class<T>, contextId?: ContextId): Promise<T>;
}
