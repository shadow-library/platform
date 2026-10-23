import { Class } from 'type-fest';

import { ProviderToken, TokenValue } from '../interfaces';
import { ContextId } from '../utils';

export abstract class ModuleRef {
  /** Throws when the provider is not found; the return type is inferred from class and `InjectionToken` tokens. */
  abstract get<Token extends ProviderToken>(token: Token): TokenValue<Token>;

  /** Throws when the provider is not transient. */
  abstract resolve<T>(typeOrToken: Class<T>, contextId?: ContextId): Promise<T>;
}
